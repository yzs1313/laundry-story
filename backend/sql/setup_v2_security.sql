-- شغّل هذا الملف في Supabase > SQL Editor بعد setup.sql
-- يقفل الإدخال المباشر ويجعل الحجز والتحقق يمران عبر دوال السيرفر فقط.

-- 1) الحجوزات: لا إدخال من المتصفح مباشرة (الدالة create-booking تدخل بمفتاح السيرفر)
drop policy if exists "public can book" on bookings;
alter table bookings add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid','paid'));
alter table bookings add column if not exists payment_id text;
alter table bookings drop constraint if exists bookings_pay_check;
alter table bookings add constraint bookings_pay_check check (pay in ('online','cash','transfer'));

-- 2) رموز التحقق: نخزن بصمة الرمز لا الرمز نفسه، وبدون أي وصول من المتصفح
drop policy if exists "anon can request otp" on otp_verifications;
drop policy if exists "anon can verify otp" on otp_verifications;
alter table otp_verifications drop column if exists code;
alter table otp_verifications add column if not exists code_hash text not null default '';
alter table otp_verifications add column if not exists attempts int not null default 0;
create index if not exists otp_phone_idx on otp_verifications (phone, created_at desc);
-- (RLS مفعّل ولا توجد سياسات = لا أحد يقرأ إلا مفتاح السيرفر)

-- 3) صلاحيات الأدمن: فقط من إيميله موجود في admin_users وحالته active
create or replace function is_staff() returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_users where lower(email) = lower(auth.jwt() ->> 'email') and status = 'active')
$$;
create or replace function is_super() returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_users where lower(email) = lower(auth.jwt() ->> 'email') and status = 'active' and role = 'super_admin')
$$;

drop policy if exists "staff read bookings"   on bookings;
drop policy if exists "staff update bookings" on bookings;
create policy "staff read bookings"   on bookings for select to authenticated using (is_staff());
create policy "staff update bookings" on bookings for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "staff manage reviews" on reviews;
create policy "staff manage reviews" on reviews for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "staff manage admin_users" on admin_users;
create policy "staff read admin_users"  on admin_users for select to authenticated using (is_staff());
create policy "super write admin_users" on admin_users for all to authenticated using (is_super()) with check (is_super());

-- 4) أنشئ أول مدير عام (غيّر الإيميل والجوال لبياناتك، ونفس الإيميل تنشئ له مستخدم في Authentication > Users)
-- insert into admin_users (name, email, phone, role) values ('الإدارة', 'you@example.com', '05XXXXXXXX', 'super_admin');
