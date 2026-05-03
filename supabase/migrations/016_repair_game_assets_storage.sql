-- Repair/refresh game-assets Storage setup used by ACP fighter portraits and ability icons.
-- Earlier migrations created the bucket with ON CONFLICT DO NOTHING, so a preexisting
-- private bucket could stay private after migrations were run.

insert into storage.buckets (id, name, public)
values ('game-assets', 'game-assets', true)
on conflict (id) do update
set public = true;

drop policy if exists "game-assets public read" on storage.objects;
create policy "game-assets public read"
  on storage.objects for select
  using (bucket_id = 'game-assets');

drop policy if exists "game-assets authenticated insert" on storage.objects;
create policy "game-assets authenticated insert"
  on storage.objects for insert
  with check (bucket_id = 'game-assets' and auth.role() = 'authenticated');

drop policy if exists "game-assets authenticated update" on storage.objects;
create policy "game-assets authenticated update"
  on storage.objects for update
  using (bucket_id = 'game-assets' and auth.role() = 'authenticated')
  with check (bucket_id = 'game-assets' and auth.role() = 'authenticated');

drop policy if exists "game-assets authenticated delete" on storage.objects;
create policy "game-assets authenticated delete"
  on storage.objects for delete
  using (bucket_id = 'game-assets' and auth.role() = 'authenticated');
