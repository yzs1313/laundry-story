import { admin, cors, esc, json, sendMail } from "../_shared/util.ts";

// يُستدعى بعد رجوع العميل من Moyasar. لا نثق بما يقوله المتصفح: نسأل Moyasar مباشرة ونقارن المبلغ.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { payment_id, booking_id } = await req.json();
    const r = await fetch(`https://api.moyasar.com/v1/payments/${encodeURIComponent(payment_id)}`, {
      headers: { Authorization: "Basic " + btoa(Deno.env.get("MOYASAR_SECRET_KEY") + ":") },
    });
    if (!r.ok) return json({ error: "تعذر التحقق من الدفع" }, 400);
    const p = await r.json();

    const db = admin();
    const { data: bk } = await db.from("bookings").select("id, price, email, name").eq("id", booking_id).single();
    if (!bk) return json({ error: "حجز غير موجود" }, 404);

    const ok = p.status === "paid" && p.amount === bk.price * 100 && p.currency === "SAR"
      && String(p.metadata?.booking_id) === String(bk.id);
    if (ok) {
      await db.from("bookings").update({ payment_status: "paid", payment_id: p.id }).eq("id", bk.id);
      try {
        if (bk.email) await sendMail(bk.email, `تم استلام دفعتك - حجز #${bk.id}`,
          `<div dir="rtl" style="font-family:Arial,sans-serif"><h3>شكراً ${esc(bk.name)}</h3><p>تم استلام دفعة ${bk.price} ر.س للحجز #${bk.id} بنجاح.</p></div>`);
      } catch (e) { console.error("mail failed", e); }
    }
    return json({ ok, status: p.status });
  } catch (e) {
    console.error(e);
    return json({ error: "خطأ" }, 500);
  }
});
