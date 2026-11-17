-- شغّل هذا الملف في Supabase > SQL Editor (بعد الملفات السابقة)
-- يحوّل التحقق من الجوال إلى الإيميل ويضيف حماية ضد الإساءة.
alter table otp_verifications add column if not exists email text;
alter table otp_verifications add column if not exists ip text;
alter table otp_verifications alter column phone drop not null;
create index if not exists otp_email_idx on otp_verifications (email, created_at desc);
create index if not exists otp_ip_idx on otp_verifications (ip, created_at desc);

alter table bookings add column if not exists email_verified boolean not null default false;
