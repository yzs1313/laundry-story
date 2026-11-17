# قصة الغسيل - دليل التشغيل (بالترتيب)

المجلدان: `site/` يُرفع على Netlify، و`backend/` للسيرفر (Supabase) ولا يُرفع للموقع.

## 1) Supabase (قاعدة البيانات والدخول)
1. أنشئ مشروعاً على supabase.com.
2. SQL Editor: شغّل `backend/sql/setup.sql` ثم `backend/sql/setup_v2_security.sql`.
3. Authentication > Providers > Email: **عطّل Enable sign ups** (مهم حتى لا يسجل غرباء).
4. Authentication > Users > Add user: أنشئ حسابك (إيميل + كلمة مرور قوية).
5. SQL Editor: شغّل سطر إضافة المدير العام (آخر سطر في setup_v2_security.sql) بنفس إيميلك.
6. Project Settings > API: انسخ Project URL و anon public key إلى `site/config.js`.

## 2) الرسائل SMS
سجّل في Taqnyat (أو Unifonic/Msegat) واحصل على API key واسم مرسل معتمد.

## 3) نشر دوال السيرفر
```
npm i -g supabase
supabase login
supabase link --project-ref YOUR_REF
supabase secrets set SMS_API_KEY=... SMS_SENDER=... TOKEN_SECRET=$(openssl rand -hex 32) \
  MOYASAR_SECRET_KEY=sk_live_... ALLOWED_ORIGIN=https://موقعك.com
cd backend && supabase functions deploy send-otp verify-otp create-booking confirm-payment --no-verify-jwt
```

## 4) الدفع
- التحويل البنكي: عدّل `bank` في `site/config.js`.
- Moyasar: ضع `pk_live_...` في `site/config.js`. لـ Apple Pay: أضف دومينك في لوحة Moyasar وارفع ملف التحقق إلى
  `site/.well-known/apple-developer-merchantid-domain-association.txt` ثم اضغط Verify.
- جرّب أولاً بمفاتيح الاختبار (pk_test / sk_test).

## 5) الرفع
ارفع محتوى مجلد `site/` على Netlify (سحب وإفلات). لوحة الأدمن: `/admin`.
