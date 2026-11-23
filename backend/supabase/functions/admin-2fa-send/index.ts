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
      attempts: 0, code_expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      verified_at: null, created_at: new Date().toISOString(),
    });
    await sendMail(me.email, "Laundry Story - رمز الدخول", `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
        <h2 style="color:#0284c7;margin:0 0 10px;text-align:center;">قصة الغسيل</h2>
        <p style="font-size:15px;color:#334155;text-align:center;">رمز تأكيد الدخول إلى لوحة الإدارة:</p>
        <div style="font-size:36px;letter-spacing:10px;font-weight:900;color:#0284c7;margin:18px 0;text-align:center;background:#f0f9ff;border:2px dashed #bae6fd;padding:12px;border-radius:10px;">
          ${esc(code)}
        </div>
        <p style="color:#64748b;font-size:13px;text-align:center;">صالح لمدة 20 دقيقة. إذا لم تحاول تسجيل الدخول فغيّر كلمة المرور فوراً.</p>
      </div>`);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر إرسال الرمز" }, 500);
  }
});
