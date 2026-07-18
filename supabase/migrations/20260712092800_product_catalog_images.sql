-- Public catalog images with administrator-only writes and constrained upload metadata.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product catalog images" on storage.objects;
create policy "Public can view product catalog images"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

drop policy if exists "Administrators can upload product catalog images" on storage.objects;
create policy "Administrators can upload product catalog images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.current_user_role() in ('admin', 'administrador')
  );

drop policy if exists "Administrators can update product catalog images" on storage.objects;
create policy "Administrators can update product catalog images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.current_user_role() in ('admin', 'administrador')
  )
  with check (
    bucket_id = 'product-images'
    and public.current_user_role() in ('admin', 'administrador')
  );

drop policy if exists "Administrators can delete product catalog images" on storage.objects;
create policy "Administrators can delete product catalog images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.current_user_role() in ('admin', 'administrador')
  );

commit;
