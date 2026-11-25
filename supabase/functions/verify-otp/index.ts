import { admin, cors, json, normalizeEmail, sha256, signToken, validEmail } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email: raw, code } = await req.json();
    const email = normalizeEmail(raw);
    if (!validEmail(email) || !/^\d{6}$/.test(String(code))) {
      return json({ ok: false, valid: false, error: "بيانات غير صحيحة" }, 400);
    }

    const db = admin();
    // نجرب كل الرموز الصالحة للإيميل (الأحدث أولاً) حتى لا يُرفض رمز صحيح
    // لمجرد وجود رمز أحدث أُرسل بعده أو بريد قديم ما زال في صندوق الوارد.
    const { data: rows } = await db.from("otp_verifications").select("*")
      .eq("email", email).eq("verified", false).gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(10);
    const candidates = rows ?? [];
    if (!candidates.length) return json({ ok: false, valid: false, error: "انتهت صلاحية الرمز أو لم يتم طلبه، اطلب رمزاً جديداً" }, 400);

    const expected = await sha256(email + code);
    const match = candidates.find(r => r.code_hash === expected && (r.attempts ?? 0) < 5);
    if (!match) {
      for (const r of candidates) {
        await db.from("otp_verifications").update({ attempts: (r.attempts ?? 0) + 1 }).eq("id", r.id);
      }
      const blocked = candidates.some(r => (r.attempts ?? 0) >= 5);
      return json({ ok: false, valid: false,
        error: blocked ? "محاولات كثيرة، اطلب رمزاً جديداً"
                       : "رمز التحقق غير صحيح أو قديم، اطلب رمزاً جديداً وتأكد من نشر كل الدوال بنفس TOKEN_SECRET"
      }, blocked ? 429 : 400);
    }
    await db.from("otp_verifications").update({ verified: true }).eq("id", match.id);
    await db.from("otp_verifications").delete().eq("email", email).eq("verified", false).neq("id", match.id);
    // توكن موقّع حقيقي فقط؛ لا يوجد مسار بديل "verified" يمكن تزويره من المتصفح.
    try {
      const token = await signToken(email);
      return json({ ok: true, valid: true, success: true, token });
    } catch (e) {
      console.error("signing failed", e);
      return json({ ok: false, error: "تعذر إكمال التحقق، تأكد من إعدادات السيرفر (TOKEN_SECRET)" }, 500);
    }
  } catch (e) {
    console.error(e);
    return json({ ok: false, valid: false, error: "خطأ في التحقق" }, 500);
  }
});
