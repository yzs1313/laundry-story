-- التقييمات تُنشر فقط بعد موافقة الإدارة (يمنع التقييمات المزيفة)
alter table reviews alter column status set default 'pending';
drop policy if exists "public can add reviews" on reviews;
create policy "public can add reviews" on reviews
  for insert to anon with check (status = 'pending' and char_length(comment) <= 500);
