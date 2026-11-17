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
