-- ─── Lease documents (phase A of lease abstraction) ──────────────────────────
-- Run after setup.sql. Safe to run again.
--
-- • Storage bucket "leases" (private, PDFs only, 50 MB per file). Files live
--   at  <workspace id>/<deal id>/<lease id>/<file name>.
-- • Table lease_documents: one row per lease (base lease + amendments, in
--   order, in `files`), with its status and, later, its abstract.
-- • Access: every member of the workspace (owner, editor, viewer) can read
--   rows and open files; owners and editors can add, change and delete them.
-- • Every insert, change and delete is written to audit_log.

create table if not exists public.lease_documents (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  deal_id          text not null,
  unit_ids         text[] not null default '{}',
  tenant           text not null default '',
  title            text not null default '',
  -- [{ path, name, size, kind: 'lease' | 'amendment' | 'other', uploaded_at, uploaded_by_email }], in document order
  files            jsonb not null default '[]'::jsonb,
  status           text not null default 'uploaded' check (status in ('uploaded', 'abstracted', 'applied')),
  abstract         jsonb,
  abstracted_at    timestamptz,
  abstracted_by_email text,
  applied_at       timestamptz,
  applied_by_email text,
  created_by       uuid default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists lease_documents_ws_deal on public.lease_documents (workspace_id, deal_id);

alter table public.lease_documents enable row level security;
drop policy if exists lease_select on public.lease_documents;
create policy lease_select on public.lease_documents for select
  using (public.ws_can(workspace_id, array['owner', 'editor', 'viewer']));
drop policy if exists lease_insert on public.lease_documents;
create policy lease_insert on public.lease_documents for insert
  with check (public.ws_can(workspace_id, array['owner', 'editor']));
drop policy if exists lease_update on public.lease_documents;
create policy lease_update on public.lease_documents for update
  using (public.ws_can(workspace_id, array['owner', 'editor']))
  with check (public.ws_can(workspace_id, array['owner', 'editor']));
drop policy if exists lease_delete on public.lease_documents;
create policy lease_delete on public.lease_documents for delete
  using (public.ws_can(workspace_id, array['owner', 'editor']));

grant select, insert, update, delete on public.lease_documents to authenticated;

-- Keeps updated_at current and writes one audit row per change.
create or replace function public.lease_documents_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.lease_documents := coalesce(new, old);
  item text := coalesce(nullif(r.tenant, ''), nullif(r.title, ''), 'Lease');
begin
  -- A workspace being deleted takes its leases with it; nothing to log.
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.audit_log (workspace_id, area, item, field, to_value, note)
    values (r.workspace_id, 'Leases', item, 'Lease added', to_jsonb(r.deal_id), 'Lease documents added');
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (workspace_id, area, item, field, from_value, note)
    values (r.workspace_id, 'Leases', item, 'Lease deleted', jsonb_array_length(old.files)::text::jsonb, 'Lease and its documents deleted');
  else
    if new.files is distinct from old.files then
      insert into public.audit_log (workspace_id, area, item, field, from_value, to_value)
      values (r.workspace_id, 'Leases', item, 'Documents',
              (select coalesce(jsonb_agg(f ->> 'name'), '[]'::jsonb) from jsonb_array_elements(old.files) f),
              (select coalesce(jsonb_agg(f ->> 'name'), '[]'::jsonb) from jsonb_array_elements(new.files) f));
    end if;
    if new.status is distinct from old.status then
      insert into public.audit_log (workspace_id, area, item, field, from_value, to_value)
      values (r.workspace_id, 'Leases', item, 'Status', to_jsonb(old.status), to_jsonb(new.status));
    end if;
    if new.tenant is distinct from old.tenant or new.title is distinct from old.title
       or new.unit_ids is distinct from old.unit_ids or new.deal_id is distinct from old.deal_id then
      insert into public.audit_log (workspace_id, area, item, field, from_value, to_value)
      values (r.workspace_id, 'Leases', item, 'Lease details',
              jsonb_build_object('tenant', old.tenant, 'title', old.title, 'units', old.unit_ids, 'deal', old.deal_id),
              jsonb_build_object('tenant', new.tenant, 'title', new.title, 'units', new.unit_ids, 'deal', new.deal_id));
    end if;
    if new.abstract is distinct from old.abstract then
      insert into public.audit_log (workspace_id, area, item, field, note)
      values (r.workspace_id, 'Leases', item, 'Abstract', case when new.abstract is null then 'Abstract removed' else 'Abstract saved' end);
    end if;
  end if;
  return null;
end $$;

create or replace function public.lease_documents_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists lease_documents_touch on public.lease_documents;
create trigger lease_documents_touch before update on public.lease_documents
  for each row execute function public.lease_documents_touch();
drop trigger if exists lease_documents_audit on public.lease_documents;
create trigger lease_documents_audit after insert or update or delete on public.lease_documents
  for each row execute function public.lease_documents_audit();

revoke execute on function public.lease_documents_audit(), public.lease_documents_touch() from public, anon, authenticated;

-- ── Storage ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leases', 'leases', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The first folder of every path is the workspace id.
create or replace function public.lease_path_ws(path text)
returns uuid language sql immutable set search_path = public as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(path, '/', 1)::uuid end
$$;
revoke execute on function public.lease_path_ws(text) from public, anon;
grant execute on function public.lease_path_ws(text) to authenticated;

drop policy if exists leases_read on storage.objects;
create policy leases_read on storage.objects for select to authenticated
  using (bucket_id = 'leases' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor', 'viewer']));
drop policy if exists leases_insert on storage.objects;
create policy leases_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'leases' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
drop policy if exists leases_update on storage.objects;
create policy leases_update on storage.objects for update to authenticated
  using (bucket_id = 'leases' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
drop policy if exists leases_delete on storage.objects;
create policy leases_delete on storage.objects for delete to authenticated
  using (bucket_id = 'leases' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
