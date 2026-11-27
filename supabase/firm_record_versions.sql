-- 1.1.12 (code review, 11/27): a history of every saved record.
--
-- firm_records is updated in place, so until now an overwritten record could
-- only be recovered from Supabase's own backups. This keeps the previous
-- version of a record each time it changes:
--
-- • firm_record_versions: one row per replaced version (the data as it was,
--   who had saved it and when, and who replaced it and when).
-- • A trigger on firm_records copies the old row in before any update that
--   changes its data, its order or its deleted flag. Nothing in save_records
--   or the app changes; the trigger works for every way a record is written.
-- • Read-only for owners and editors of the firm (viewers can't read it;
--   nobody can write to it directly). Rows are removed only with the firm.
-- • The settings record changes often, so its history keeps the last 200
--   versions; every other record keeps all of them.
--
-- To look at an asset's earlier versions:
--   select version, replaced_at, replaced_by_email, saved_by_email
--   from firm_record_versions
--   where kind = 'deal' and key = '<deal id>' order by version desc;
-- To see one: add  , data  to the select and pick the version.
-- Restoring is done by hand (or by Claude at your request): copy that data
-- back with a normal save, so the restore itself is logged and versioned.
--
-- Safe to run again.

create table if not exists public.firm_record_versions (
  id                bigint generated always as identity primary key,
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  kind              text not null,
  key               text not null,
  version           integer not null,          -- the version this row holds (the one that was replaced)
  sort              integer not null default 0,
  data              jsonb not null,
  deleted           boolean not null default false,
  saved_by          uuid,                      -- who had saved this version
  saved_by_email    text,
  saved_at          timestamptz,
  replaced_by       uuid default auth.uid(),   -- who saved the next version
  replaced_by_email text default (auth.jwt() ->> 'email'),
  replaced_at       timestamptz not null default now()
);
create index if not exists firm_record_versions_rec on public.firm_record_versions (workspace_id, kind, key, version desc);

alter table public.firm_record_versions enable row level security;
drop policy if exists firm_record_versions_select on public.firm_record_versions;
create policy firm_record_versions_select on public.firm_record_versions for select
  using (public.ws_can(workspace_id, array['owner', 'editor']));
-- No insert / update / delete policies: only the trigger writes here.
revoke all on public.firm_record_versions from anon, authenticated;
grant select on public.firm_record_versions to authenticated;

create or replace function public.firm_records_keep_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.data is distinct from old.data or new.deleted is distinct from old.deleted or new.sort is distinct from old.sort then
    insert into public.firm_record_versions (workspace_id, kind, key, version, sort, data, deleted, saved_by, saved_by_email, saved_at)
    values (old.workspace_id, old.kind, old.key, old.version, old.sort, old.data, old.deleted, old.updated_by, old.updated_by_email, old.updated_at);
    -- The working log and the settings record change constantly: keep the last 200 of each.
    if old.kind in ('settings', 'local_log') then
      delete from public.firm_record_versions v
      where v.workspace_id = old.workspace_id and v.kind = old.kind and v.key = old.key
        and v.id not in (
          select id from public.firm_record_versions
          where workspace_id = old.workspace_id and kind = old.kind and key = old.key
          order by id desc limit 200);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.firm_records_keep_version() from public, anon, authenticated;

drop trigger if exists firm_records_keep_version on public.firm_records;
create trigger firm_records_keep_version
  before update on public.firm_records
  for each row execute function public.firm_records_keep_version();
