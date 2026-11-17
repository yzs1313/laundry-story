# قصة الغسيل - النسخة النهائية (كل التعديلات في ملف واحد)

مجلد `site/` = ما ترفعه على Netlify (سحب وإفلات للمجلد نفسه).
مجلد `backend/` = للسيرفر (Supabase)، لا يُرفع على Netlify.

## الخطوات (مرة واحدة)
1. Supabase > SQL Editor: شغّل `backend/sql/update_all.sql` (آمن لو أعدته).
2. Gmail: فعّل التحقق بخطوتين ثم أنشئ كلمة مرور تطبيق من myaccount.google.com/apppasswords
3. Supabase > Edge Functions > Secrets: أضف
   GMAIL_USER, GMAIL_APP_PASSWORD, TOKEN_SECRET (نص عشوائي طويل),
   ALLOWED_ORIGIN = https://laundry-story.netlify.app
   BANK_HOLDER, BANK_NAME, BANK_IBAN  (+ OWNER_EMAIL اختياري)
4. انشر الدوال الأربع من `backend/supabase/functions` (send-otp, verify-otp, create-booking, confirm-payment)
   مع إيقاف التحقق JWT (no-verify-jwt).
5. افتح `site/config.js` وضع الآيبان الحقيقي في bank.
6. ارفع مجلد `site/` على Netlify.

## ملاحظات
- الدفع الإلكتروني (Apple Pay/مدى) مخفي حتى تضيف moyasarPublishableKey في config.js (له رسوم على كل عملية).
- التقييمات تظهر بعد ضغط "نشر" من لوحة الأدمن (/admin).
- الحجز: 3 حجوزات لكل ساعة، وسجل باسم الأدمن الذي قبل الحجز، وزر "جرد" في لوحة الأدمن.
