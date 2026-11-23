-- Asset photos and floor plans (phase I part 2).
-- A private bucket for images (and floor-plan PDFs), mirroring deal-docs:
-- every workspace member can read; owners and editors upload, change and delete.
-- Paths are <workspace_id>/<deal_id>/<file>, like the other buckets
-- (public.lease_path_ws reads the workspace id from the first folder).
-- Photo details (caption, date, order, cover) live in the workspace data
-- (inputs.assetMedia), so no table is needed. Safe to run again.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asset-photos', 'asset-photos', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists asset_photos_read on storage.objects;
create policy asset_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'asset-photos' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor', 'viewer']));
drop policy if exists asset_photos_insert on storage.objects;
create policy asset_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'asset-photos' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
drop policy if exists asset_photos_update on storage.objects;
create policy asset_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'asset-photos' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
drop policy if exists asset_photos_delete on storage.objects;
create policy asset_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'asset-photos' and public.ws_can(public.lease_path_ws(name), array['owner', 'editor']));
