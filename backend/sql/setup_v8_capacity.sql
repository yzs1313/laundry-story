-- سعة الساعة: كم حجزاً يقبل كل موعد. غيّر الرقم في الدالة أدناه عند الحاجة (الآن 3).
-- آمن لو أعدت تشغيله. يلغي قاعدة "حجز واحد فقط للساعة" القديمة إن كانت موجودة.

drop index if exists one_per_slot;

create or replace function slot_capacity() returns int language sql immutable as $$ select 3 $$;

create or replace function enforce_slot_capacity() returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' then return new; end if;
  -- قفل لكل (تاريخ + ساعة) حتى لا يتجاوز حجزان متزامنان السعة
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

-- الساعات المكتملة فقط (للتوافق مع النسخ القديمة من الموقع)
create or replace function taken_slots(d date) returns text[]
language sql security definer set search_path = public as $$
  select coalesce(array_agg(slot), '{}') from (
    select slot from bookings where date = d and status <> 'cancelled'
    group by slot having count(*) >= slot_capacity()
  ) s
$$;
grant execute on function taken_slots(date) to anon;

-- عدد الحجوزات وسعة كل ساعة (لعرض "متبقي 2 من 3" للعميل)
create or replace function slot_counts(d date) returns table(slot text, n int, cap int)
language sql security definer set search_path = public as $$
  select slot, count(*)::int, slot_capacity() from bookings
  where date = d and status <> 'cancelled' group by slot
$$;
grant execute on function slot_counts(date) to anon;
