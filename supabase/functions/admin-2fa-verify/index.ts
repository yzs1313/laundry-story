import { admin, authAdmin, cors, json, sha256 } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await authAdmin(req);
    if (!me) return json({ error: "غير مصرح" }, 401);
    const { code } = await req.json();
    if (!/^\d{6}$/.test(String(code))) return json({ error: "الرمز يتكون من 6 أرقام" }, 400);

    const db = admin();
    const { data: row } = await db.from("admin_2fa").select("*").eq("session_id", me.sessionId).maybeSingle();
    if (!row || !row.code_hash || !row.code_expires_at || new Date(row.code_expires_at) < new Date())
      return json({ error: "انتهت صلاحية الرمز، اطلب رمزاً جديداً" }, 400);
    if (row.attempts >= 5) return json({ error: "محاولات كثيرة، اطلب رمزاً جديداً" }, 429);

    if (row.code_hash !== await sha256(me.sessionId + code)) {
      await db.from("admin_2fa").update({ attempts: row.attempts + 1 }).eq("session_id", me.sessionId);
      return json({ error: "الرمز غير صحيح" }, 400);
    }
    await db.from("admin_2fa").update({ verified_at: new Date().toISOString(), code_hash: null }).eq("session_id", me.sessionId);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "خطأ في التحقق" }, 500);
  }
});
