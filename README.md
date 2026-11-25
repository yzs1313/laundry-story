# قصة الغسيل - دليل النشر النهائي

## ترتيب الملفات
- المجلد `site/` هو ما ترفعه على الاستضافة (Netlify أو Vercel). يحتوي الآن على كل الملفات المطلوبة: `index.html`, `carwash.html`, `admin.html`, `style.css`, `app.js`, `config.js`, `guard.js`, `assets/`.
- الكود المعدّل موجود في جذر المشروع، و`site/` نسخة مطابقة منه. **عدّل الجذر ثم انسخ الملف إلى `site/`** قبل كل رفع.
- `supabase/functions/` هو المجلد الوحيد لنشر الدوال. نسخة `backend/supabase/functions/` مطابقة منه (للاحتياط فقط) — لا تنشر من الاثنين.

## 1) Supabase - قاعدة البيانات (مرة واحدة)
1. SQL Editor: شغّل `backend/sql/setup.sql`.
2. ثم شغّل `backend/sql/update_all.sql` (آمن إعادة تشغيله). يشمل كل التحديثات: الأمان، سعة 3 للساعة، تحقق الإيميل، 2FA للأدمن، سجل الحذف، أوقات الدوام، ومتابعة حالة الحجز.
3. Authentication > Providers > Email: عطّل **Enable sign ups**.
4. Authentication > Users: أنشئ حسابك (إيميل + كلمة مرور قوية).
5. في نهاية `setup_v2_security.sql` يوجد سطر مثال لإضافة المدير العام؛ شغّله بإيميلك نفسه.

## 2) الأسرار (Supabase > Edge Functions > Secrets)
```
GMAIL_USER=بريدك@gmail.com
GMAIL_APP_PASSWORD=كلمة-مرور-التطبيق-من-google.com/apppasswords
TOKEN_SECRET=نص-عشوائي-طويل-32-حرفاً-أكثر
ALLOWED_ORIGIN=https://رابط-موقعك-الحقيقي
BANK_HOLDER=...
BANK_NAME=...
BANK_IBAN=...
OWNER_EMAIL=...            (اختياري: نسخة من كل حجز تصل الإدارة)
MOYASAR_SECRET_KEY=sk_live_... (فقط إذا فعّلت الدفع الإلكتروني)
```
مهم: `ALLOWED_ORIGIN` يجب أن يكون **أصل الموقع الذي تفتحه فعلياً** بدون شرطة مائلة في النهاية (مثلاً `https://laundry-story.vercel.app`). أي اختلاف يمنع رموز التحقق من الوصول ويظهر كأن التحقق "معلّق".

## 3) نشر دوال السيرفر
من جذر المشروع:
```
npm i -g supabase
supabase login
supabase link --project-ref YOUR_REF
supabase functions deploy send-otp verify-otp create-booking confirm-payment admin-2fa-send admin-2fa-verify admin-manage --no-verify-jwt
```
احرص على أن كل الدوال من نفس المجلد (`supabase/functions`) وبنفس `TOKEN_SECRET`، وإلا سيفشل التحقق.

## 4) إعدادات الموقع
- افتح `config.js` وتأكد من `supabaseUrl`, `supabaseKey`, `bank`.
- الدفع الإلكتروني مخفي حتى تضع `moyasarPublishableKey` (pk_live_...). للتحويل البنكي لا تحتاج Moyasar.

## 5) الرفع
ارفع محتوى مجلد `site/` كاملاً. لوحة الأدمن: `/admin` (تطلب رمز 2FA على بريدك بعد كلمة المرور).

## ملاحظات
- التحقق عند الحجز يتم برمز OTP يُرسل للإيميل، وليس SMS. النافذة تعرض زر إعادة الإرسال حتى لو فشل الإرسال، ولا يمكن تكرار الضغط أثناء الإرسال.
- بعد كل حجز ناجح يُمسح التحقق؛ إن انتهت صلاحية التوكن تُفتح نافذة الرمز تلقائياً بدل تكرار نفس المحاولة.
- التقييمات لا تظهر إلا بعد موافقة الأدمن.
- السعة 3 حجوزات لكل ساعة.
