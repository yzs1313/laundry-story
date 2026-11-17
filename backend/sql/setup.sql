-- ========================================================
-- قاعدة بيانات قصة الغسيل - الدوادمي
-- ========================================================

-- 1. جدول الحجوزات
create table if not exists bookings (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) <= 80),
  phone      text not null check (char_length(phone) <= 20),
  email      text,
  car        text check (char_length(car) <= 80),
  service    text not null,
  price      int  not null check (price > 0),
  date       date not null,
  slot       text not null,
  pay        text not null check (pay in ('online','cash')),
  lat        double precision not null,
  lng        double precision not null,
  loc_url    text,
  phone_verified boolean not null default false,
  status     text not null default 'new' check (status in ('new','confirmed','in_progress','done','cancelled')),
  constraint dawadmi_only check (lat between 24.31 and 24.71 and lng between 44.19 and 44.59)
);

create unique index if not exists one_per_slot on bookings (date, slot) where status <> 'cancelled';
alter table bookings enable row level security;

create policy "public can book" on bookings
  for insert to anon with check (status = 'new');

create policy "staff read bookings"   on bookings for select to authenticated using (true);
create policy "staff update bookings" on bookings for update to authenticated using (true) with check (true);

-- دالة إرجاع الأوقات المحجوزة
create or replace function taken_slots(d date) returns text[]
language sql security definer set search_path = public as $$
  select coalesce(array_agg(slot), '{}') from bookings where date = d and status <> 'cancelled'
$$;
grant execute on function taken_slots(date) to anon;

-- 2. جدول تقييمات العملاء
create table if not exists reviews (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) <= 80),
  rating     int not null check (rating between 1 and 5),
  package    text,
  tags       text,
  comment    text not null check (char_length(comment) <= 500),
  district   text,
  status     text not null default 'approved' check (status in ('pending','approved','hidden'))
);

alter table reviews enable row level security;

create policy "public can read approved reviews" on reviews
  for select to anon using (status = 'approved');

create policy "public can add reviews" on reviews
  for insert to anon with check (status = 'approved');

create policy "staff manage reviews" on reviews
  for all to authenticated using (true) with check (true);

-- 3. جدول حسابات الأدمن والموظفين (Admin Accounts)
create table if not exists admin_users (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text unique not null,
  phone       text unique not null,
  role        text not null check (role in ('super_admin','manager','dispatcher','washer')),
  status      text not null default 'active' check (status in ('active','suspended')),
  last_login  timestamptz
);

alter table admin_users enable row level security;

create policy "staff manage admin_users" on admin_users
  for all to authenticated using (true) with check (true);

-- 4. جدول رموز التحقق OTP لمنع البيانات الوهمية
create table if not exists otp_verifications (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  phone      text not null,
  code       text not null,
  expires_at timestamptz not null,
  verified   boolean not null default false
);

alter table otp_verifications enable row level security;

create policy "anon can request otp" on otp_verifications
  for insert to anon with check (true);

create policy "anon can verify otp" on otp_verifications
  for select to anon using (expires_at > now() and verified = false);
