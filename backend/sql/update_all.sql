-- update_all.sql: شغّله مرة واحدة في Supabase SQL Editor (آمن لو أعدته)
-- يشمل: سعة 3 للساعة + سجل الأدمن + تحقق الإيميل + تقييمات حقيقية
-- (بعد setup.sql و setup_v2_security.sql اللي شغّلتهم قبل)

-- ======== setup_v3_capacity_and_audit.sql ========
-- شغّل هذا الملف في Supabase > SQL Editor (بعد setup.sql و setup_v2_security.sql)

-- 1) سعة 3 حجوزات لكل ساعة (بدل حجز واحد)
drop index if exists one_per_slot;

create or replace function enforce_slot_capacity() returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' then return new; end if;
  -- قفل لكل (تاريخ + ساعة) حتى لا يتجاوز حجزان متزامنان السعة
  perform pg_advisory_xact_lock(hashtext(new.date::text || '|' || new.slot));
  if (select count(*) from bookings
        where date = new.date and slot = new.slot and status <> 'cancelled'
          and id is distinct from new.id) >= 3 then
    raise exception 'slot_full';
  end if;
  return new;
end $$;

drop trigger if exists trg_slot_capacity on bookings;
create trigger trg_slot_capacity before insert or update of date, slot, status on bookings
  for each row execute function enforce_slot_capacity();

-- الأوقات المكتملة (3 أو أكثر) فقط تظهر "محجوز" للعميل
create or replace function taken_slots(d date) returns text[]
language sql security definer set search_path = public as $$
  select coalesce(array_agg(slot), '{}') from (
    select slot from bookings where date = d and status <> 'cancelled'
    group by slot having count(*) >= 3
  ) s
$$;
grant execute on function taken_slots(date) to anon;

-- 2) تسجيل الأدمن الذي قبل/أنجز/ألغى كل حجز (لا يمكن تزويره من المتصفح)
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
  -- القيم المرسلة من المتصفح تُتجاهل دائماً
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

-- ======== setup_v4_email_otp.sql ========
-- شغّل هذا الملف في Supabase > SQL Editor (بعد الملفات السابقة)
-- يحوّل التحقق من الجوال إلى الإيميل ويضيف حماية ضد الإساءة.
alter table otp_verifications add column if not exists email text;
alter table otp_verifications add column if not exists ip text;
alter table otp_verifications alter column phone drop not null;
create index if not exists otp_email_idx on otp_verifications (email, created_at desc);
create index if not exists otp_ip_idx on otp_verifications (ip, created_at desc);

alter table bookings add column if not exists email_verified boolean not null default false;

-- ======== setup_v5_real_reviews.sql ========
-- التقييمات تُنشر فقط بعد موافقة الإدارة (يمنع التقييمات المزيفة)
alter table reviews alter column status set default 'pending';
drop policy if exists "public can add reviews" on reviews;
create policy "public can add reviews" on reviews
  for insert to anon with check (status = 'pending' and char_length(comment) <= 500);
