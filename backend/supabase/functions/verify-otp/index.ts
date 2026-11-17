import { admin, cors, json, normalizeEmail, sha256, signToken, validEmail } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email: raw, code } = await req.json();
    const email = normalizeEmail(raw);
    if (!validEmail(email) || !/^\d{6}$/.test(String(code))) return json({ error: "بيانات غير صحيحة" }, 400);

    const db = admin();
    const { data: row } = await db.from("otp_verifications").select("*")
      .eq("email", email).eq("verified", false).gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row) return json({ error: "انتهت صلاحية الرمز، اطلب رمزاً جديداً" }, 400);
    if (row.attempts >= 5) return json({ error: "محاولات كثيرة، اطلب رمزاً جديداً" }, 429);

    if (row.code_hash !== await sha256(email + code)) {
      await db.from("otp_verifications").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return json({ error: "رمز التحقق غير صحيح" }, 400);
    }
    await db.from("otp_verifications").update({ verified: true }).eq("id", row.id);
    return json({ ok: true, token: await signToken(email) });
  } catch (e) {
    console.error(e);
    return json({ error: "خطأ في التحقق" }, 500);
  }
});
