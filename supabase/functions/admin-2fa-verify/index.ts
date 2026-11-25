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

async function sha256(s: string) {
  const enc = new TextEncoder();
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s + Deno.env.get("TOKEN_SECRET")));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function authAdmin(req: Request): Promise<{ email: string; sessionId: string } | null> {
  const authHeader = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!authHeader || authHeader.split(".").length !== 3) return null;
  const db = admin();
  const { data, error } = await db.auth.getUser(authHeader);
  if (error || !data.user?.email) return null;
  let sessionId = "";
  try {
    const b64 = authHeader.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    sessionId = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))).session_id ?? "";
  } catch (_) {}
  if (!sessionId) sessionId = data.user.id;
  const email = data.user.email.toLowerCase();
  const { data: row } = await db.from("admin_users").select("status").eq("email", email).maybeSingle();
  if (!row || row.status !== "active") return null;
  return { email, sessionId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await authAdmin(req);
    if (!me) return json({ error: "غير مصرح" }, 401);
    const { code } = await req.json();
    if (!/^\d{6}$/.test(String(code))) return json({ error: "الرمز يتكون من 6 أرقام" }, 400);

    const db = admin();
    // الرمز مرتبط بهذه الجلسة فقط؛ لا قبول بأي رمز من جلسة أخرى أو إيميل آخر.
    const { data: row } = await db.from("admin_2fa").select("*").eq("session_id", me.sessionId).maybeSingle();
    if (!row || !row.code_hash || !row.code_expires_at || new Date(row.code_expires_at) < new Date())
      return json({ error: "انتهت صلاحية الرمز، اطلب رمزاً جديداً" }, 400);
    if (row.attempts >= 5) return json({ error: "محاولات كثيرة، اطلب رمزاً جديداً" }, 429);

    const validHash = row.code_hash === await sha256(row.session_id + code);
    if (!validHash) {
      await db.from("admin_2fa").update({ attempts: row.attempts + 1 }).eq("session_id", row.session_id);
      return json({ error: "رمز التحقق غير صحيح" }, 400);
    }
    await db.from("admin_2fa").update({ verified_at: new Date().toISOString(), code_hash: null }).eq("session_id", row.session_id);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "خطأ في التحقق" }, 500);
  }
});
