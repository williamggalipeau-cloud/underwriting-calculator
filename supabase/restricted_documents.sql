-- ─── Restricted documents (1.1.15) ───────────────────────────────────────────
-- Run after deal_documents.sql. Safe to run again.
--
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
