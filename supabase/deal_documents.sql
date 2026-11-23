-- ─── Deal documents (phase E; used by phases F–H) ────────────────────────────
-- Run after setup.sql and leases.sql. Safe to run again.
--
-- • Storage bucket "deal-docs" (private, PDFs only, 50 MB per file). Files live
--   at <workspace id>/<deal id or "fund">/<document id>/<file name>.
-- • Table deal_documents: one row per document (OM, rent roll, T-12, LOI, PSA,
--   IC memo, closing statements, insurance certificate, LPA, PPM, and later
--   loan, appraisal, estoppel, CAM, billing). Asset documents have a deal_id;
--   fund-level documents (LPA, PPM) have none and name their fund instead.
-- • Access: every member reads; owners and editors add, change and delete.
-- • Every insert, change and delete is written to audit_log.

create table if not exists public.deal_documents (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  deal_id          text,                       -- null for fund-level documents
  fund_name        text not null default '',    -- the fund (fund-level documents; also set for asset documents)
  doc_type         text not null check (doc_type in ('om', 'rent_roll', 't12', 'loi', 'psa', 'ic_memo', 'closing_acq', 'closing_disp',
                                                     'lpa', 'ppm', 'insurance_cert', 'loan', 'rate_cap', 'appraisal', 'estoppel', 'cam', 'billing', 'other')),
  title            text not null default '',
  lease_id         uuid references public.lease_documents(id) on delete set null,  -- tenant insurance certificates, estoppels
  files            jsonb not null default '[]'::jsonb,   -- [{ path, name, size, uploaded_at, uploaded_by_email }], in order
  status           text not null default 'uploaded' check (status in ('uploaded', 'abstracted', 'applied')),
  abstract         jsonb,
  applied_fields   jsonb not null default '{}'::jsonb,   -- { field key: { value, at, by } } taken into the model
  abstracted_at    timestamptz,
  abstracted_by_email text,
  applied_at       timestamptz,
  applied_by_email text,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (deal_id is not null or doc_type in ('lpa', 'ppm', 'other'))
);
create index if not exists deal_documents_ws on public.deal_documents (workspace_id, deal_id);

alter table public.deal_documents enable row level security;
drop policy if exists deal_doc_select on public.deal_documents;
create policy deal_doc_select on public.deal_documents for select
  using (public.ws_can(workspace_id, array['owner', 'editor', 'viewer']));
drop policy if exists deal_doc_insert on public.deal_documents;
create policy deal_doc_insert on public.deal_documents for insert
  with check (public.ws_can(workspace_id, array['owner', 'editor']));
drop policy if exists deal_doc_update on public.deal_documents;
create policy deal_doc_update on public.deal_documents for update
  using (public.ws_can(workspace_id, array['owner', 'editor']))
  with check (public.ws_can(workspace_id, array['owner', 'editor']));
drop policy if exists deal_doc_delete on public.deal_documents;
create policy deal_doc_delete on public.deal_documents for delete
  using (public.ws_can(workspace_id, array['owner', 'editor']));
grant select, insert, update, delete on public.deal_documents to authenticated;

create or replace function public.deal_documents_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.deal_documents := coalesce(new, old);
  item text := coalesce(nullif(r.title, ''), replace(r.doc_type, '_', ' '));
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.audit_log (workspace_id, area, item, field, to_value, note)
    values (r.workspace_id, 'Documents', item, 'Document added', to_jsonb(coalesce(r.deal_id, r.fund_name)), 'Document uploaded');
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (workspace_id, area, item, field, note)
    values (r.workspace_id, 'Documents', item, 'Document deleted', 'Document and its files deleted');
  else
    if new.files is distinct from old.files then
      insert into public.audit_log (workspace_id, area, item, field, from_value, to_value)
      values (r.workspace_id, 'Documents', item, 'Files',
              (select coalesce(jsonb_agg(f ->> 'name'), '[]'::jsonb) from jsonb_array_elements(old.files) f),
              (select coalesce(jsonb_agg(f ->> 'name'), '[]'::jsonb) from jsonb_array_elements(new.files) f));
    end if;
    if new.status is distinct from old.status then
      insert into public.audit_log (workspace_id, area, item, field, from_value, to_value)
      values (r.workspace_id, 'Documents', item, 'Status', to_jsonb(old.status), to_jsonb(new.status));
    end if;
    if new.abstract is distinct from old.abstract then
      insert into public.audit_log (workspace_id, area, item, field, note)
      values (r.workspace_id, 'Documents', item, 'Abstract', case when new.abstract is null then 'Abstract removed' else 'Abstract saved' end);
    end if;
    if new.title is distinct from old.title or new.deal_id is distinct from old.deal_id or new.lease_id is distinct from old.lease_id
       or new.fund_name is distinct from old.fund_name then
      insert into public.audit_log (workspace_id, area, item, field, from_value, to_value)
      values (r.workspace_id, 'Documents', item, 'Document details',
              jsonb_build_object('title', old.title, 'deal', old.deal_id, 'fund', old.fund_name, 'lease', old.lease_id),
              jsonb_build_object('title', new.title, 'deal', new.deal_id, 'fund', new.fund_name, 'lease', new.lease_id));
    end if;
  end if;
  return null;
end $$;

drop trigger if exists deal_documents_touch on public.deal_documents;
create trigger deal_documents_touch before update on public.deal_documents
  for each row execute function public.lease_documents_touch();
drop trigger if exists deal_documents_audit on public.deal_documents;
create trigger deal_documents_audit after insert or update or delete on public.deal_documents
  for each row execute function public.deal_documents_audit();
revoke execute on function public.deal_documents_audit() from public, anon, authenticated;

-- Saves an abstract (or clears it with null). Owners and editors only.
create or replace function public.save_deal_abstract(doc uuid, abstract jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  st text;
begin
  select workspace_id into ws from public.deal_documents where id = doc;
  if ws is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if not public.ws_can(ws, array['owner', 'editor']) then
    raise exception 'Only owners and editors can save an abstract' using errcode = '42501';
  end if;
  if abstract is not null and jsonb_typeof(abstract) <> 'object' then
    raise exception 'The abstract must be a JSON object' using errcode = '22023';
  end if;
  update public.deal_documents
     set abstract = save_deal_abstract.abstract,
         status = case when save_deal_abstract.abstract is null then 'uploaded' else 'abstracted' end,
         abstracted_at = case when save_deal_abstract.abstract is null then null else now() end,
         abstracted_by_email = case when save_deal_abstract.abstract is null then null else auth.jwt() ->> 'email' end
   where id = doc
  returning status into st;
  return st;
end $$;
revoke execute on function public.save_deal_abstract(uuid, jsonb) from public, anon;
grant execute on function public.save_deal_abstract(uuid, jsonb) to authenticated;

-- ── Storage ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deal-docs', 'deal-docs', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists deal_docs_read on storage.objects;
create policy deal_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'deal-docs' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor', 'viewer']));
drop policy if exists deal_docs_insert on storage.objects;
create policy deal_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-docs' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
drop policy if exists deal_docs_update on storage.objects;
create policy deal_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'deal-docs' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
drop policy if exists deal_docs_delete on storage.objects;
create policy deal_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'deal-docs' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
