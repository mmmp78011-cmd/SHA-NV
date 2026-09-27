-- The Edge Function writes to this private bucket using the service-role key.
-- Files are therefore never exposed directly to the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-files',
  'student-files',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
