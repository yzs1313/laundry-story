import { admin, cors, esc, json, normalizeEmail, sendMail, sha256, validEmail } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email: raw } = await req.json();
    const email = normalizeEmail(raw);
    if (!validEmail(email)) return json({ error: "البريد الإلكتروني غير صحيح" }, 400);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const db = admin();
    const since10 = new Date(Date.now() - 10 * 60_000).toISOString();
    const since1h = new Date(Date.now() - 60 * 60_000).toISOString();

    const byEmail = await db.from("otp_verifications").select("id", { count: "exact", head: true })
      .eq("email", email).gte("created_at", since10);
    if ((byEmail.count ?? 0) >= 3) return json({ error: "تجاوزت عدد المحاولات، حاول بعد 10 دقائق" }, 429);
    const byIp = await db.from("otp_verifications").select("id", { count: "exact", head: true })
      .eq("ip", ip).gte("created_at", since1h);
    if ((byIp.count ?? 0) >= 10) return json({ error: "محاولات كثيرة من نفس الجهاز، حاول لاحقاً" }, 429);

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    // لا يبقى أكثر من رمز صالح للإيميل: أي رمز أقدم يُلغى عند إرسال رمز جديد
    await db.from("otp_verifications").delete().eq("email", email).eq("verified", false);
    await db.from("otp_verifications").insert({
      email, ip, code_hash: await sha256(email + code),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });

    await sendMail(email, "رمز التحقق - قصة الغسيل", `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#0284c7;margin:0 0 8px">قصة الغسيل</h2>
        <p>رمز التحقق الخاص بك لتأكيد الحجز:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:12px 0">${esc(code)}</p>
        <p style="color:#6b7280;font-size:13px">صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز تجاهل الرسالة.</p>
      </div>`);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر إرسال الرمز، حاول مرة أخرى" }, 500);
  }
});
