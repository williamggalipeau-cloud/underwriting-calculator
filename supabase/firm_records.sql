-- Phase Q (bundle 1, run with the user present on 11/22 evening): one firm,
-- saved record by record instead of one big workspace JSON.
--
-- • firm_records holds the firm's data, one row per item:
--     kind 'deal'        key = deal id         (open deals, in tab order: sort)
--     kind 'saved_deal'  key = deal id         (saved fund snapshots)
--     kind 'fund'        key = fund name       (fund terms)
--     kind 'valuation'   key = deal id         ({ "YYYY-MM-DD": mark })
--     kind 'settings'    key = 'main'          (comps, forward curve, other app settings)
--     kind 'local_log'   key = 'main'          (the app's working change log)
--   Each row has its own version: a save names the version it started from,
--   so two people editing different assets never clash, and an edit to the
--   same item from a stale screen is refused instead of overwriting.
-- • save_records(ws, items, changes): saves rows atomically and writes the
--   change log (audit_log), like save_workspace did for the whole JSON.
-- • Realtime: firm_records is published so every open screen updates when
--   the database changes.
-- • workspaces.archived: the user's real workspace ("Moved from browser
--   11/21/2026", 6ce3e4d4-…) is migrated and renamed "Baywise"; the two other
--   workspaces are archived (kept, read-only in the app, never deleted).
--   workspaces.data is left untouched as a fallback.
-- Safe to run again.

alter table public.workspaces add column if not exists archived boolean not null default false;
alter table public.workspaces add column if not exists archived_at timestamptz;
alter table public.workspaces add column if not exists storage text not null default 'json';  -- 'json' | 'records'
-- The workspaces.version the records were built from. If the old app saves
-- the JSON again before the new code is live, version > records_from_version
-- and the new code re-imports that JSON into firm_records once.
alter table public.workspaces add column if not exists records_from_version integer;

create table if not exists public.firm_records (
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  kind             text not null check (kind in ('deal', 'saved_deal', 'fund', 'valuation', 'settings', 'local_log')),
  key              text not null,
  sort             integer not null default 0,
  data             jsonb not null,
  deleted          boolean not null default false,
  version          integer not null default 1,
  updated_by       uuid default auth.uid(),
  updated_by_email text default (auth.jwt() ->> 'email'),
  updated_at       timestamptz not null default now(),
  primary key (workspace_id, kind, key)
);
create index if not exists firm_records_ws on public.firm_records (workspace_id, kind, sort);

alter table public.firm_records enable row level security;
drop policy if exists firm_records_select on public.firm_records;
create policy firm_records_select on public.firm_records for select
  using (public.ws_can(workspace_id, array['owner', 'editor', 'viewer']));
-- Writes go through save_records only (no direct insert/update/delete policies).
grant select on public.firm_records to authenticated;

-- items: [{ kind, key, data, sort?, deleted?, expected_version (null = new) }]
-- changes: [{ area, item, field, path, from, to, note }] for audit_log
-- Returns [{ kind, key, version }]. A version mismatch raises 40001
-- 'conflict: <kind>/<key> is at version n' and nothing is saved.
create or replace function public.save_records(ws uuid, items jsonb, changes jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  cur public.firm_records;
  out jsonb := '[]'::jsonb;
  newv integer;
  c jsonb;
begin
  if not public.ws_can(ws, array['owner', 'editor']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.workspaces where id = ws and archived) then
    raise exception 'archived' using errcode = '42501';
  end if;
  for it in select * from jsonb_array_elements(coalesce(items, '[]'::jsonb)) loop
    select * into cur from public.firm_records
     where workspace_id = ws and kind = it ->> 'kind' and key = it ->> 'key' for update;
    if cur.workspace_id is null then
      if it ? 'expected_version' and it -> 'expected_version' <> 'null'::jsonb then
        raise exception 'conflict: %/% no longer exists', it ->> 'kind', it ->> 'key' using errcode = '40001';
      end if;
      insert into public.firm_records (workspace_id, kind, key, sort, data, deleted)
      values (ws, it ->> 'kind', it ->> 'key', coalesce((it ->> 'sort')::integer, 0), coalesce(it -> 'data', '{}'::jsonb), coalesce((it ->> 'deleted')::boolean, false));
      newv := 1;
    else
      if (it -> 'expected_version') is not null and it -> 'expected_version' <> 'null'::jsonb
         and (it ->> 'expected_version')::integer <> cur.version then
        raise exception 'conflict: %/% is at version %', cur.kind, cur.key, cur.version using errcode = '40001';
      end if;
      newv := cur.version + 1;
      update public.firm_records
         set data = coalesce(it -> 'data', cur.data),
             sort = coalesce((it ->> 'sort')::integer, cur.sort),
             deleted = coalesce((it ->> 'deleted')::boolean, cur.deleted),
             version = newv,
             updated_by = auth.uid(),
             updated_by_email = auth.jwt() ->> 'email',
             updated_at = now()
       where workspace_id = ws and kind = cur.kind and key = cur.key;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('kind', it ->> 'kind', 'key', it ->> 'key', 'version', newv));
  end loop;
  for c in select * from jsonb_array_elements(coalesce(changes, '[]'::jsonb)) loop
    insert into public.audit_log (workspace_id, area, item, field, path, from_value, to_value, note)
    values (ws, c ->> 'area', c ->> 'item', c ->> 'field', c -> 'path', c -> 'from', c -> 'to', c ->> 'note');
  end loop;
  update public.workspaces set updated_at = now(), updated_by = auth.uid(), updated_by_email = auth.jwt() ->> 'email' where id = ws;
  return out;
end $$;
revoke execute on function public.save_records(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_records(uuid, jsonb, jsonb) to authenticated;

-- Realtime updates for open screens (RLS still applies to what each user receives).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'firm_records') then
    alter publication supabase_realtime add table public.firm_records;
  end if;
end $$;

-- ── One-time migration of the real workspace (idempotent) ──────────────────
do $$
declare
  ws uuid := '6ce3e4d4-39f0-4141-8d79-e06ef2864f1f';
  d jsonb;
begin
  select data into d from public.workspaces where id = ws;
  if d is null then
    raise exception 'workspace % not found', ws;
  end if;
  insert into public.firm_records (workspace_id, kind, key, sort, data)
  select ws, 'deal', x.v ->> 'id', x.i::integer, x.v
    from jsonb_array_elements(coalesce(d -> 'deals', '[]'::jsonb)) with ordinality as x(v, i)
  on conflict do nothing;
  insert into public.firm_records (workspace_id, kind, key, sort, data)
  select ws, 'saved_deal', x.v ->> 'id', x.i::integer, x.v
    from jsonb_array_elements(coalesce(d -> 'savedDeals', '[]'::jsonb)) with ordinality as x(v, i)
  on conflict do nothing;
  insert into public.firm_records (workspace_id, kind, key, data)
  select ws, 'fund', f.k, f.v from jsonb_each(coalesce(d -> 'funds', '{}'::jsonb)) as f(k, v)
  on conflict do nothing;
  insert into public.firm_records (workspace_id, kind, key, data)
  select ws, 'valuation', f.k, f.v from jsonb_each(coalesce(d -> 'valuations', '{}'::jsonb)) as f(k, v)
  on conflict do nothing;
  insert into public.firm_records (workspace_id, kind, key, data)
  values (ws, 'settings', 'main', d - 'deals' - 'savedDeals' - 'funds' - 'valuations' - 'auditLog'),
         (ws, 'local_log', 'main', jsonb_build_object('entries', coalesce(d -> 'auditLog', '[]'::jsonb)))
  on conflict do nothing;
  update public.workspaces set storage = 'records', name = 'Baywise',
         records_from_version = coalesce(records_from_version, version) where id = ws;
  update public.workspaces set archived = true, archived_at = coalesce(archived_at, now())
   where id in ('ee6c56ce-6ae8-4db6-bc2d-4ed2338357c8', '4db6bc4f-dd29-4db1-8bbb-e461d0451c26');
  insert into public.audit_log (workspace_id, area, item, field, note)
  select ws, 'Workspace', 'Baywise', 'Storage', 'Moved to record-by-record storage (phase Q); the other two workspaces archived'
   where not exists (select 1 from public.audit_log where workspace_id = ws and field = 'Storage');
end $$;
