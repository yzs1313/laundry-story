-- update_all.sql -- شغّله مرة واحدة في Supabase > SQL Editor بعد setup.sql
-- آمن لو أعدت تشغيله. يشمل كل التحديثات: الأمان، السعة، تحقق الإيميل،
-- 2FA للأدمن، الحذف، أوقات الدوام، ومتابعة حالة الحجز للعميل.

-- ======== v2: الأمان ========
drop policy if exists "public can book" on bookings;
alter table bookings add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid','paid'));
alter table bookings add column if not exists payment_id text;
alter table bookings drop constraint if exists bookings_pay_check;
alter table bookings add constraint bookings_pay_check check (pay in ('online','cash','transfer'));

drop policy if exists "anon can request otp" on otp_verifications;
drop policy if exists "anon can verify otp" on otp_verifications;
alter table otp_verifications drop column if exists code;
alter table otp_verifications add column if not exists code_hash text not null default '';
alter table otp_verifications add column if not exists attempts int not null default 0;
create index if not exists otp_phone_idx on otp_verifications (phone, created_at desc);

create or replace function is_staff() returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_users where lower(email) = lower(auth.jwt() ->> 'email') and status = 'active')
$$;
create or replace function is_super() returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_users where lower(email) = lower(auth.jwt() ->> 'email') and status = 'active' and role = 'super_admin')
$$;

drop policy if exists "staff read bookings" on bookings;
drop policy if exists "staff update bookings" on bookings;
create policy "staff read bookings" on bookings for select to authenticated using (is_staff());
create policy "staff update bookings" on bookings for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "staff manage reviews" on reviews;
create policy "staff manage reviews" on reviews for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "staff manage admin_users" on admin_users;
drop policy if exists "staff read admin_users" on admin_users;
drop policy if exists "super write admin_users" on admin_users;
create policy "staff read admin_users" on admin_users for select to authenticated using (is_staff());
create policy "super write admin_users" on admin_users for all to authenticated using (is_super()) with check (is_super());

-- ======== v3: سجل الأدمن ========
alter table bookings add column if not exists accepted_by text;
alter table bookings add column if not exists accepted_by_name text;
alter table bookings add column if not exists accepted_at timestamptz;
alter table bookings add column if not exists done_by text;
alter table bookings add column if not exists cancelled_by text;

create or replace function audit_booking_status() returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text := lower(coalesce(auth.jwt() ->> 'email', ''));
  who_name text;
begin
  new.accepted_by      := old.accepted_by;
  new.accepted_by_name := old.accepted_by_name;
  new.accepted_at      := old.accepted_at;
  new.done_by          := old.done_by;
  new.cancelled_by     := old.cancelled_by;
  if new.status is distinct from old.status and who <> '' then
    select name into who_name from admin_users where lower(email) = who;
    if new.status in ('confirmed','in_progress','done') and old.accepted_by is null then
      new.accepted_by := who; new.accepted_by_name := coalesce(who_name, who); new.accepted_at := now();
    end if;
    if new.status = 'done' then new.done_by := who; end if;
    if new.status = 'cancelled' then new.cancelled_by := who; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_booking on bookings;
create trigger trg_audit_booking before update on bookings
  for each row execute function audit_booking_status();

-- ======== v4: تحقق الإيميل ========
alter table otp_verifications add column if not exists email text;
alter table otp_verifications add column if not exists ip text;
alter table otp_verifications alter column phone drop not null;
create index if not exists otp_email_idx on otp_verifications (email, created_at desc);
create index if not exists otp_ip_idx on otp_verifications (ip, created_at desc);
alter table bookings add column if not exists email_verified boolean not null default false;

-- ======== v5: تقييمات حقيقية ========
alter table reviews alter column status set default 'pending';
drop policy if exists "public can add reviews" on reviews;
create policy "public can add reviews" on reviews
  for insert to anon with check (status = 'pending' and char_length(comment) <= 500);

-- ======== v6: 2FA للوحة الأدمن ========
create table if not exists admin_2fa (
  session_id      text primary key,
  email           text not null,
  code_hash       text,
  attempts        int  not null default 0,
  code_expires_at timestamptz,
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);
alter table admin_2fa enable row level security;
drop policy if exists "read own admin row" on admin_users;
create policy "read own admin row" on admin_users for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

create or replace function is_staff() returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_users u where lower(u.email) = lower(auth.jwt() ->> 'email') and u.status = 'active')
     and exists (select 1 from admin_2fa f where f.session_id = auth.jwt() ->> 'session_id'
                   and f.verified_at is not null and f.verified_at > now() - interval '12 hours')
$$;
create or replace function is_super() returns boolean language sql security definer set search_path = public stable as $$
  select is_staff() and exists (select 1 from admin_users u where lower(u.email) = lower(auth.jwt() ->> 'email') and u.status = 'active' and u.role = 'super_admin')
$$;

-- ======== v7: حذف الطلبات مع سجل ========
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

-- ======== v8: سعة 3 حجوزات للساعة ========
drop index if exists one_per_slot;
create or replace function slot_capacity() returns int language sql immutable as $$ select 3 $$;
create or replace function enforce_slot_capacity() returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.date::text || '|' || new.slot));
  if (select count(*) from bookings
        where date = new.date and slot = new.slot and status <> 'cancelled'
          and id is distinct from new.id) >= slot_capacity() then
    raise exception 'slot_full';
  end if;
  return new;
end $$;
drop trigger if exists trg_slot_capacity on bookings;
create trigger trg_slot_capacity before insert or update of date, slot, status on bookings
  for each row execute function enforce_slot_capacity();

create or replace function taken_slots(d date) returns text[]
language sql security definer set search_path = public as $$
  select coalesce(array_agg(slot), '{}') from (
    select slot from bookings where date = d and status <> 'cancelled'
    group by slot having count(*) >= slot_capacity()
  ) s
$$;
grant execute on function taken_slots(date) to anon;

create or replace function slot_counts(d date) returns table(slot text, n int, cap int)
language sql security definer set search_path = public as $$
  select slot, count(*)::int, slot_capacity() from bookings
  where date = d and status <> 'cancelled' group by slot
$$;
grant execute on function slot_counts(date) to anon;

-- ======== أوقات الدوام (كانت تُحفظ بدون جدول) ========
create table if not exists site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table site_settings enable row level security;
grant select on site_settings to anon, authenticated;
grant insert, update, delete on site_settings to authenticated;
drop policy if exists "public read site settings" on site_settings;
create policy "public read site settings" on site_settings
  for select to anon, authenticated using (key = 'working_hours');
drop policy if exists "staff write site settings" on site_settings;
create policy "staff write site settings" on site_settings
  for all to authenticated using (is_staff()) with check (is_staff());

-- ======== متابعة حالة الحجز للعميل (بيانات محدودة فقط) ========
create or replace function lookup_my_bookings(p_phone text)
returns table(id bigint, service text, price int, date date, slot text, car text, status text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, service, price, date, slot, car, status, created_at
  from bookings
  where right(regexp_replace(phone, '\D', '', 'g'), 9)
      = right(regexp_replace(p_phone, '\D', '', 'g'), 9)
  order by date desc, created_at desc
  limit 20
$$;
grant execute on function lookup_my_bookings(text) to anon;
