import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const rawOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const ALLOWED = rawOrigin === "*" ? "*" : rawOrigin.trim().replace(/\/+$/, "");
const cors = {
  "Access-Control-Allow-Origin": ALLOWED,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: cors });

const esc = (x: unknown) => String(x ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function normalizePhone(p: string): string | null {
  const d = String(p ?? "").replace(/\D/g, "");
  let n = d;
  if (n.startsWith("00966")) n = n.slice(5);
  else if (n.startsWith("966")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  return /^5\d{8}$/.test(n) ? "966" + n : null;
}

const normalizeEmail = (e: string) => String(e ?? "").trim().toLowerCase();
const validEmail = (e: string) => e.length <= 120 && /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(e);

function formatSubject(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

async function sendMail(to: string, subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER")!;
  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true,
      auth: { username: user, password: Deno.env.get("GMAIL_APP_PASSWORD")! } },
  });
  try {
    await client.send({
      from: `"Laundry Story" <${user}>`,
      to,
      subject: formatSubject(subject),
      html,
    });
  } finally {
    await client.close();
  }
}

const PRICES: Record<string, Record<string, number>> = {
  regular: { small: 30, medium: 35, large: 40 },
  deep: { small: 230, medium: 230, large: 280 },
};
const PKG_NAMES: Record<string, string> = { regular: "باقة الغسيل العادي", deep: "باقة الغسيل العميق" };
const SIZE_NAMES: Record<string, string> = { small: "سيارة صغيرة", medium: "سيارة وسط", large: "سيارة كبيرة" };
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
    </table>${bank}
    <p style="color:#6b7280;font-size:12px;margin-top:14px">هذا إيصال تأكيد حجز وليس فاتورة ضريبية. للاستفسار: واتساب 0533719216</p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const email = normalizeEmail(b.email);
    if (!validEmail(email)) return json({ error: "البريد الإلكتروني غير صحيح" }, 400);
    const phone = normalizePhone(b.phone);
    if (!phone) return json({ error: "رقم الجوال غير صحيح (يجب أن يبدأ بـ 05)" }, 400);

    const price = PRICES[b.pkg]?.[b.size];
    if (!price) return json({ error: "باقة أو حجم غير صحيح" }, 400);
    if (!["cash", "transfer", "online"].includes(b.pay)) return json({ error: "طريقة دفع غير صحيحة" }, 400);

    const name = String(b.name ?? "").trim().slice(0, 80);
    let lat = Number(b.lat), lng = Number(b.lng);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !b.slot) return json({ error: "بيانات ناقصة" }, 400);

    if (isNaN(lat) || isNaN(lng) || !(lat > 24.31 && lat < 24.71 && lng > 44.19 && lng < 44.59)) {
      lat = 24.5077;
      lng = 44.3923;
    }
    if (new Date(b.date + "T23:59:59+03:00") < new Date()) return json({ error: "التاريخ منتهي" }, 400);

    const db = admin();
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: otpRow } = await db.from("otp_verifications").select("id")
      .eq("email", email).eq("verified", true).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!otpRow) return json({ error: "البريد غير موثق، أعد التحقق" }, 401);

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

    await db.from("otp_verifications").delete().eq("email", email).eq("verified", true);

    const full = { ...row, id: data.id };
    try {
      await sendMail(email, `تأكيد حجزك #${data.id} - قصة الغسيل`, receiptHtml(full, false));
      const owner = Deno.env.get("OWNER_EMAIL") ?? Deno.env.get("GMAIL_USER")!;
      await sendMail(owner, `حجز جديد #${data.id} - ${name}`, receiptHtml(full, true));
    } catch (e) { console.error("mail failed", e); }

    const bank = b.pay === "transfer"
      ? { holder: Deno.env.get("BANK_HOLDER") ?? "", name: Deno.env.get("BANK_NAME") ?? "", iban: Deno.env.get("BANK_IBAN") ?? "" }
      : undefined;
    return json({ ok: true, id: data.id, price: data.price, bank });
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر حفظ الحجز" }, 500);
  }
});
