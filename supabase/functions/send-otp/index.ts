import { admin, cors, json, normalizePhone, sha256 } from "../_shared/util.ts";

// مزود الرسائل: Taqnyat (https://taqnyat.sa). لتغيير المزود عدّل دالة sendSms فقط.
async function sendSms(to: string, text: string) {
  const r = await fetch("https://api.taqnyat.sa/v1/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("SMS_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipients: [to], body: text, sender: Deno.env.get("SMS_SENDER") }),
  });
  if (!r.ok) throw new Error("sms_failed " + r.status + " " + (await r.text()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { phone: raw } = await req.json();
    const phone = normalizePhone(raw);
    if (!phone) return json({ error: "رقم الجوال غير صحيح (يجب أن يكون رقم سعودي يبدأ بـ 05)" }, 400);

    const db = admin();
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db.from("otp_verifications").select("id", { count: "exact", head: true })
      .eq("phone", phone).gte("created_at", since);
    if ((count ?? 0) >= 3) return json({ error: "تجاوزت عدد المحاولات، حاول بعد 10 دقائق" }, 429);

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.from("otp_verifications").insert({
      phone, code_hash: await sha256(phone + code),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    await sendSms(phone, `رمز التحقق الخاص بك في قصة الغسيل: ${code}\nصالح لمدة 5 دقائق.`);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر إرسال الرمز، حاول مرة أخرى" }, 500);
  }
});
