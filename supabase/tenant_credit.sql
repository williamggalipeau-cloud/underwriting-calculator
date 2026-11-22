-- ─── Tenant credit documents (lease abstraction phase D) ─────────────────────
-- Run after leases.sql. Safe to run again.
--
-- • Table lease_credit_documents: one row per credit report or financial
--   statement on a lease (tenant or guarantor), with its key figures.
-- • Files live in the private "leases" bucket under
--   <workspace id>/<deal id>/<lease id>/credit/<file name>.
-- • Access: OWNERS AND EDITORS ONLY, for the rows and the files. Viewers can't
--   list, open or change them (they're confidential). The lease documents
--   themselves stay readable by viewers.
-- • Every insert, change and delete is written to audit_log without any
--   figures (the audit log is readable by every member).

create table if not exists public.lease_credit_documents (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  lease_id         uuid not null references public.lease_documents(id) on delete cascade,
  deal_id          text not null,
  kind             text not null default 'credit_report'
                   check (kind in ('credit_report', 'financial_statement', 'tax_return', 'bank_reference', 'other')),
  subject          text not null default 'tenant' check (subject in ('tenant', 'guarantor')),
  subject_name     text not null default '',
  source           text not null default '',          -- e.g. D&B, Experian, audited by …, tenant-prepared
  audited          boolean,
  period_end       date,                               -- statements: period covered (fiscal year end)
  report_date      date,                               -- credit reports: date of the report
  -- { path, name, size } in the leases bucket (credit/ folder)
  file             jsonb,
  -- { score, rating, revenue, netIncome, ebitda, currentAssets, currentLiabilities,
  --   currentRatio, totalDebt, equity, debtToEquity, quotes: { field: quote } }
  figures          jsonb not null default '{}'::jsonb,
  figures_source   text not null default 'manual' check (figures_source in ('manual', 'claude')),
  notes            text not null default '',
  uploaded_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists lease_credit_ws_lease on public.lease_credit_documents (workspace_id, lease_id);

alter table public.lease_credit_documents enable row level security;
drop policy if exists credit_select on public.lease_credit_documents;
create policy credit_select on public.lease_credit_documents for select
  using (public.ws_can(workspace_id, array['owner', 'editor']));
drop policy if exists credit_insert on public.lease_credit_documents;
create policy credit_insert on public.lease_credit_documents for insert
  with check (public.ws_can(workspace_id, array['owner', 'editor'])
              and exists (select 1 from public.lease_documents l where l.id = lease_id and l.workspace_id = lease_credit_documents.workspace_id));
drop policy if exists credit_update on public.lease_credit_documents;
create policy credit_update on public.lease_credit_documents for update
  using (public.ws_can(workspace_id, array['owner', 'editor']))
  with check (public.ws_can(workspace_id, array['owner', 'editor']));
drop policy if exists credit_delete on public.lease_credit_documents;
create policy credit_delete on public.lease_credit_documents for delete
  using (public.ws_can(workspace_id, array['owner', 'editor']));

grant select, insert, update, delete on public.lease_credit_documents to authenticated;

create or replace function public.lease_credit_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.lease_credit_documents := coalesce(new, old);
  tenant text := coalesce((select nullif(tenant, '') from public.lease_documents where id = r.lease_id), 'Lease');
  what text := replace(r.kind, '_', ' ') || case when r.subject = 'guarantor' then ' (guarantor)' else '' end;
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.audit_log (workspace_id, area, item, field, note)
    values (r.workspace_id, 'Tenant credit', tenant, what, 'Credit document added');
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (workspace_id, area, item, field, note)
    values (r.workspace_id, 'Tenant credit', tenant, what, 'Credit document deleted');
  elsif new.figures is distinct from old.figures or new.period_end is distinct from old.period_end
        or new.report_date is distinct from old.report_date or new.kind is distinct from old.kind
        or new.source is distinct from old.source or new.file is distinct from old.file then
    -- No figures in the log: viewers can read it.
    insert into public.audit_log (workspace_id, area, item, field, note)
    values (r.workspace_id, 'Tenant credit', tenant, what, 'Credit document changed');
  end if;
  return null;
end $$;

drop trigger if exists lease_credit_touch on public.lease_credit_documents;
create trigger lease_credit_touch before update on public.lease_credit_documents
  for each row execute function public.lease_documents_touch();
drop trigger if exists lease_credit_audit on public.lease_credit_documents;
create trigger lease_credit_audit after insert or update or delete on public.lease_credit_documents
  for each row execute function public.lease_credit_audit();
revoke execute on function public.lease_credit_audit() from public, anon, authenticated;

-- ── Storage: the credit/ folder of a lease is owners and editors only ───────
-- A path's folders are [workspace, deal, lease, 'credit'].
create or replace function public.lease_path_is_credit(path text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(split_part(path, '/', 4) = 'credit' and split_part(path, '/', 5) <> '', false)
$$;
revoke execute on function public.lease_path_is_credit(text) from public, anon;
grant execute on function public.lease_path_is_credit(text) to authenticated;

drop policy if exists leases_read on storage.objects;
create policy leases_read on storage.objects for select to authenticated
  using (
    bucket_id = 'leases' and (
      public.ws_can(public.lease_path_ws(name), array['owner', 'editor'])
      or (not public.lease_path_is_credit(name) and public.ws_can(public.lease_path_ws(name), array['viewer']))
    )
  );
