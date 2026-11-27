-- ─── Baywise 1.1.15: database changes ────────────────────────────────────────
-- Run once in the Supabase SQL editor (paste the whole file). Safe to run again.
-- Needs setup.sql, leases.sql, deal_documents.sql and firm_records.sql (already run).
--
-- 1. Restricted documents: viewers no longer read tenant credit documents or
--    GP partner agreements.
-- 2. Saving: a save that has no version for a record that already exists is
--    refused as a conflict (the app then merges and retries) instead of
--    replacing the record.

-- ── 1. Restricted documents ──────────────────────────────────────────────────
-- Tenant credit documents and GP partner agreements are kept in the same
-- store as the other deal documents. Until now every member of the firm,
-- viewers included, could read them. After this script:
--   • owners and editors read every document, as before;
--   • viewers read every document EXCEPT
--       - GP partner agreements        (title starts "[gp-agreement:…]")
--       - tenant and prospect credit   (title "[leasing:…] Credit screening report: …",
--         documents                     "[leasing:…] Credit report: …",
--                                       "[leasing:…] Credit assessment memo: …")
--     both the row (with what Claude read from it) and the file itself.
-- Adding, changing and deleting documents is unchanged (owners and editors).

create or replace function public.deal_doc_restricted(title text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(
    title ~ '^\[gp-agreement:[^\]]*\]'
    or title ~ '^\[leasing:[^\]]+\] (Credit screening report|Credit report|Credit assessment memo):',
    false)
$$;
revoke execute on function public.deal_doc_restricted(text) from public, anon;
grant execute on function public.deal_doc_restricted(text) to authenticated;

-- Files live at <firm id>/<asset id or "fund">/<document id>/<file name>.
-- Looks the document up with the definer's rights, because a viewer cannot
-- see a restricted row and so could not be told the file belongs to one.
create or replace function public.deal_doc_path_restricted(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.deal_documents d
     where d.id::text = split_part(path, '/', 3)
       and d.workspace_id = public.lease_path_ws(path)
       and public.deal_doc_restricted(d.title))
$$;
revoke execute on function public.deal_doc_path_restricted(text) from public, anon;
grant execute on function public.deal_doc_path_restricted(text) to authenticated;

drop policy if exists deal_doc_select on public.deal_documents;
create policy deal_doc_select on public.deal_documents for select
  using (public.ws_can(workspace_id, array['owner', 'editor'])
         or (public.ws_can(workspace_id, array['viewer']) and not public.deal_doc_restricted(title)));

drop policy if exists deal_docs_read on storage.objects;
create policy deal_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'deal-docs'
         and (public.ws_can(public.lease_path_ws(name), array['owner', 'editor'])
              or (public.ws_can(public.lease_path_ws(name), array['viewer']) and not public.deal_doc_path_restricted(name))));

-- ── 2. Saving records ────────────────────────────────────────────────────────
-- The same function as in firm_records.sql (kept identical by a test).
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
      -- 1.1.15: a save that believes the record is new (no expected_version)
      -- while a live record exists is a conflict too; it used to replace it.
      -- A deleted record may still be saved back without a version.
      if ((it -> 'expected_version') is null or it -> 'expected_version' = 'null'::jsonb) and not cur.deleted then
        raise exception 'conflict: %/% is at version %', cur.kind, cur.key, cur.version using errcode = '40001';
      end if;
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
