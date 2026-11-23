import { admin, authAdmin, cors, esc, json, sendMail, sha256 } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await authAdmin(req);
    if (!me) return json({ error: "غير مصرح" }, 401);

    const db = admin();
    const { data: cur } = await db.from("admin_2fa").select("*").eq("session_id", me.sessionId).maybeSingle();
    // حد: رمز واحد كل 30 ثانية، ولا يُرسل رمز جديد لجلسة موثقة
    if (cur?.verified_at) return json({ ok: true, verified: true });
    if (cur && Date.now() - new Date(cur.created_at).getTime() < 30_000 && cur.code_hash) {
      return json({ error: "انتظر 30 ثانية قبل إعادة الإرسال" }, 429);
    }

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.from("admin_2fa").upsert({
      session_id: me.sessionId, email: me.email, code_hash: await sha256(me.sessionId + code),
      attempts: 0, code_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      verified_at: null, created_at: new Date().toISOString(),
    });
    await sendMail(me.email, "رمز دخول لوحة الإدارة - قصة الغسيل", `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#0284c7;margin:0 0 8px">قصة الغسيل - لوحة الإدارة</h2>
        <p>رمز تأكيد تسجيل الدخول:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:12px 0">${esc(code)}</p>
        <p style="color:#6b7280;font-size:13px">صالح 10 دقائق. إذا لم تحاول تسجيل الدخول فغيّر كلمة المرور فوراً.</p>
      </div>`);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر إرسال الرمز" }, 500);
  }
});
