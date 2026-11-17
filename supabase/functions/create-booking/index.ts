import { admin, checkToken, cors, json, normalizePhone, PKG_NAMES, PRICES, SIZE_NAMES } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const phone = normalizePhone(b.phone);
    if (!phone || !(await checkToken(b.token, phone))) return json({ error: "الجوال غير موثق، أعد التحقق" }, 401);

    const price = PRICES[b.pkg]?.[b.size];
    if (!price) return json({ error: "باقة أو حجم غير صحيح" }, 400);
    if (!["cash", "transfer", "online"].includes(b.pay)) return json({ error: "طريقة دفع غير صحيحة" }, 400);

    const name = String(b.name ?? "").trim().slice(0, 80);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !b.slot) return json({ error: "بيانات ناقصة" }, 400);
    if (!(lat > 24.31 && lat < 24.71 && lng > 44.19 && lng < 44.59)) return json({ error: "الموقع خارج نطاق الخدمة (الدوادمي)" }, 400);
    if (new Date(b.date + "T23:59:59+03:00") < new Date()) return json({ error: "التاريخ منتهي" }, 400);

    const { data, error } = await admin().from("bookings").insert({
      name, phone, email: b.email ? String(b.email).slice(0, 120) : null,
      car: String(b.car ?? "").slice(0, 80), service: `${PKG_NAMES[b.pkg]} - ${SIZE_NAMES[b.size]}`,
      price, date: b.date, slot: String(b.slot), pay: b.pay, lat, lng,
      loc_url: String(b.loc ?? "").slice(0, 300), phone_verified: true, status: "new",
      payment_status: "unpaid",
    }).select("id, price").single();

    if (error) {
      if (error.code === "23505") return json({ error: "هذا الموعد محجوز، اختر وقتاً آخر" }, 409);
      throw error;
    }
    return json({ ok: true, id: data.id, price: data.price });
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر حفظ الحجز" }, 500);
  }
});
