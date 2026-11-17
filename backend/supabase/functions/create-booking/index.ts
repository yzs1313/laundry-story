import { admin, checkToken, cors, esc, json, normalizeEmail, normalizePhone, PKG_NAMES, PRICES, SIZE_NAMES, sendMail, validEmail } from "../_shared/util.ts";

const PAY_NAMES: Record<string, string> = {
  cash: "الدفع عند الوصول (كاش/شبكة)", transfer: "تحويل بنكي", online: "دفع إلكتروني (Apple Pay / مدى / فيزا)",
};

function receiptHtml(b: any, forOwner: boolean) {
  const bank = b.pay === "transfer" ? `
    <div style="background:#f0f9ff;border-radius:8px;padding:12px;margin-top:12px">
      <b>بيانات التحويل البنكي</b><br>
      المستفيد: ${esc(Deno.env.get("BANK_HOLDER"))}<br>البنك: ${esc(Deno.env.get("BANK_NAME"))}<br>
      الآيبان: <span dir="ltr">${esc(Deno.env.get("BANK_IBAN"))}</span><br>
      المبلغ: ${b.price} ر.س · اكتب في الملاحظات: #${b.id}<br>
      بعد التحويل أرسل صورة الإيصال عبر الواتساب لتأكيد حجزك.
    </div>` : "";
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#6b7280">${k}</td><td style="padding:6px 0"><b>${v}</b></td></tr>`;
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px">
    <h2 style="color:#0284c7;margin:0 0 4px">قصة الغسيل</h2>
    <p style="margin:0 0 12px;color:#6b7280">${forOwner ? "حجز جديد" : "تأكيد الحجز وإيصال الطلب"} · رقم الحجز #${b.id}</p>
    <table style="width:100%;border-collapse:collapse">
      ${row("الاسم", esc(b.name))}${row("الجوال", esc(b.phone))}${row("السيارة", esc(b.car))}
      ${row("الخدمة", esc(b.service))}${row("التاريخ", esc(b.date))}${row("الساعة", esc(b.slot))}
      ${row("طريقة الدفع", esc(PAY_NAMES[b.pay]))}${row("الإجمالي", b.price + " ر.س")}
      ${forOwner && b.loc_url ? row("الموقع", `<a href="${esc(b.loc_url)}">فتح الخريطة</a>`) : ""}
    </table>${forOwner ? "" : bank}
    <p style="color:#6b7280;font-size:12px;margin-top:14px">هذا إيصال تأكيد حجز وليس فاتورة ضريبية. للاستفسار: واتساب 0533719216</p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const email = normalizeEmail(b.email);
    if (!validEmail(email) || !(await checkToken(b.token, email))) return json({ error: "البريد غير موثق، أعد التحقق" }, 401);
    const phone = normalizePhone(b.phone);
    if (!phone) return json({ error: "رقم الجوال غير صحيح (يجب أن يبدأ بـ 05)" }, 400);

    const price = PRICES[b.pkg]?.[b.size];
    if (!price) return json({ error: "باقة أو حجم غير صحيح" }, 400);
    if (!["cash", "transfer", "online"].includes(b.pay)) return json({ error: "طريقة دفع غير صحيحة" }, 400);

    const name = String(b.name ?? "").trim().slice(0, 80);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !b.slot) return json({ error: "بيانات ناقصة" }, 400);
    if (!(lat > 24.31 && lat < 24.71 && lng > 44.19 && lng < 44.59)) return json({ error: "الموقع خارج نطاق الخدمة (الدوادمي)" }, 400);
    if (new Date(b.date + "T23:59:59+03:00") < new Date()) return json({ error: "التاريخ منتهي" }, 400);

    const db = admin();
    // حد على الحجوزات المفتوحة لنفس الجوال والبريد (حماية من حجز كل المواعيد)
    const { count } = await db.from("bookings").select("id", { count: "exact", head: true })
      .or(`phone.eq.${phone},email.eq.${email}`).in("status", ["new", "confirmed"]).gte("date", new Date().toISOString().slice(0, 10));
    if ((count ?? 0) >= 3) return json({ error: "لديك 3 حجوزات قائمة بالفعل. تواصل معنا لتعديلها." }, 429);

    const row = {
      name, phone, email, car: String(b.car ?? "").slice(0, 80),
      service: `${PKG_NAMES[b.pkg]} - ${SIZE_NAMES[b.size]}`, price, date: b.date, slot: String(b.slot),
      pay: b.pay, lat, lng, loc_url: String(b.loc ?? "").slice(0, 300),
      phone_verified: false, email_verified: true, status: "new", payment_status: "unpaid",
    };
    const { data, error } = await db.from("bookings").insert(row).select("id, price").single();
    if (error) {
      if (error.code === "23505" || String(error.message).includes("slot_full")) return json({ error: "هذا الموعد اكتمل (3 حجوزات)، اختر وقتاً آخر" }, 409);
      throw error;
    }

    // الإيصال للعميل + تنبيه لصاحب المحل. فشل الإيميل لا يلغي الحجز.
    const full = { ...row, id: data.id };
    try {
      await sendMail(email, `تأكيد حجزك #${data.id} - قصة الغسيل`, receiptHtml(full, false));
      const owner = Deno.env.get("OWNER_EMAIL") ?? Deno.env.get("GMAIL_USER")!;
      await sendMail(owner, `حجز جديد #${data.id} - ${name}`, receiptHtml(full, true));
    } catch (e) { console.error("mail failed", e); }

    return json({ ok: true, id: data.id, price: data.price });
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر حفظ الحجز" }, 500);
  }
});
