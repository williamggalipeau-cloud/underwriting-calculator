-- Log fund reassignment of fund documents (LPA, PPM) in the change log.
-- Same function as in deal_documents.sql; safe to run again.
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
