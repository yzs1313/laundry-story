-- حذف الطلبات: للمدير العام فقط، مع حفظ نسخة من كل طلب محذوف (من حذفه ومتى)
-- يحتاج setup_v2_security.sql (دالة is_super). ويُفضّل بعد setup_v6_admin_2fa.sql.

create table if not exists deleted_bookings (
  id         bigserial primary key,
  booking    jsonb not null,
  deleted_by text,
  deleted_at timestamptz not null default now()
);
alter table deleted_bookings enable row level security;

drop policy if exists "super read deleted_bookings" on deleted_bookings;
create policy "super read deleted_bookings" on deleted_bookings
  for select to authenticated using (is_super());

create or replace function log_booking_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into deleted_bookings (booking, deleted_by)
  values (to_jsonb(old), lower(coalesce(auth.jwt() ->> 'email', '')));
  return old;
end $$;

drop trigger if exists trg_log_booking_delete on bookings;
create trigger trg_log_booking_delete before delete on bookings
  for each row execute function log_booking_delete();

drop policy if exists "super delete bookings" on bookings;
create policy "super delete bookings" on bookings
  for delete to authenticated using (is_super());
