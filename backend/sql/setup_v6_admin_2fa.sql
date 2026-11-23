-- التحقق بخطوتين للوحة الأدمن: رمز على الإيميل بعد كلمة المرور (يُفرض من السيرفر)
create table if not exists admin_2fa (
  session_id      text primary key,
  email           text not null,
  code_hash       text,
  attempts        int  not null default 0,
  code_expires_at timestamptz,
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);
alter table admin_2fa enable row level security;   -- بدون سياسات: لا يقرأه إلا السيرفر

-- الأدمن يقدر يقرأ صفه هو فقط قبل إكمال الرمز (ليعرف السيرفر دوره)
drop policy if exists "read own admin row" on admin_users;
create policy "read own admin row" on admin_users for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- الصلاحية لا تُعطى إلا بعد تأكيد الرمز في نفس الجلسة (آخر 12 ساعة)
create or replace function is_staff() returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_users u where lower(u.email) = lower(auth.jwt() ->> 'email') and u.status = 'active')
     and exists (select 1 from admin_2fa f where f.session_id = auth.jwt() ->> 'session_id'
                   and f.verified_at is not null and f.verified_at > now() - interval '12 hours')
$$;
create or replace function is_super() returns boolean language sql security definer set search_path = public stable as $$
  select is_staff() and exists (select 1 from admin_users u where lower(u.email) = lower(auth.jwt() ->> 'email') and u.status = 'active' and u.role = 'super_admin')
$$;
