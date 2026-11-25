# قصة الغسيل - نشر سريع (قائمة تحقق)

1. Supabase > SQL Editor: شغّل `backend/sql/setup.sql` ثم `backend/sql/update_all.sql`.
2. Authentication: عطّل التسجيل الحر، وأنشئ مستخدمك، ثم أضف إيميلك في `admin_users` بدور `super_admin`.
3. Secrets:
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD` (كلمة مرور تطبيق من Google)
   - `TOKEN_SECRET` (نص عشوائي طويل)
   - `ALLOWED_ORIGIN` = رابط الموقع الحقيقي بدون `/` في النهاية
   - `BANK_HOLDER`, `BANK_NAME`, `BANK_IBAN`
   - `MOYASAR_SECRET_KEY` اختياري للدفع الإلكتروني
4. انشر كل الدوال من مجلد واحد فقط:
   ```
   cd supabase
   supabase functions deploy send-otp verify-otp create-booking confirm-payment admin-2fa-send admin-2fa-verify admin-manage --no-verify-jwt
   ```
5. عدّل `config.js` (الجذر) ثم انسخه إلى `site/`. تأكد أن `site/` يحتوي `app.js` و`style.css` و`guard.js`.
6. ارفع محتوى `site/` على Netlify/Vercel. جرّب حجزاً كاملاً: وصول الرمز → تأكيد → ظهور شاشة النجاح → ظهور الحجز في `/admin`.

استكشاف سريع لمشكلة "التحقق معلق":
- الرمز لا يصل؟ تحقق من `GMAIL_USER`/`GMAIL_APP_PASSWORD` وصندوق Spam.
- رسالة CORS/فشل فوري؟ تحقق من `ALLOWED_ORIGIN` ومن نشر الدوال بـ `--no-verify-jwt`.
- الحجز ي fail بعد التحقق؟ تأكد أن كل الدوال تستخدم نفس `TOKEN_SECRET` وأن `update_all.sql` مطبّق.
