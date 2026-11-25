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

async function sha256(s: string) {
  const enc = new TextEncoder();
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s + Deno.env.get("TOKEN_SECRET")));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function formatSubject(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function foldBase64(s: string): string {
  return (s.match(/.{1,76}/g) ?? []).join("\r\n");
}
function plainFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h2|h3|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
      mimeContent: [
        {
          mimeType: 'text/plain; charset="utf-8"',
          content: foldBase64(base64Utf8(plainFromHtml(html))),
          transferEncoding: "base64",
        },
        {
          mimeType: 'text/html; charset="utf-8"',
          content: foldBase64(base64Utf8(html)),
          transferEncoding: "base64",
        },
      ],
    });
  } finally {
    await client.close();
  }
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

    const db = admin();
    const { data: cur } = await db.from("admin_2fa").select("*").eq("session_id", me.sessionId).maybeSingle();
    if (cur?.verified_at) return json({ ok: true, verified: true });
    if (cur && Date.now() - new Date(cur.created_at).getTime() < 15_000 && cur.code_hash) {
      return json({ error: "انتظر 15 ثانية قبل طلب رمز جديد" }, 429);
    }

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.from("admin_2fa").upsert({
      session_id: me.sessionId, email: me.email, code_hash: await sha256(me.sessionId + code),
      attempts: 0, code_expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      verified_at: null, created_at: new Date().toISOString(),
    });

    const htmlBody = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:440px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <div style="text-align:center;margin-bottom:16px;">
          <h2 style="color:#0284c7;margin:0 0 4px;font-size:22px;">قصة الغسيل</h2>
          <span style="font-size:13px;color:#64748b;">لوحة التحكم الإدارية</span>
        </div>
        <p style="font-size:15px;color:#1e293b;margin:16px 0 8px;text-align:center;">رمز تأكيد تسجيل الدخول الخاص بك:</p>
        <div style="font-size:36px;letter-spacing:10px;font-weight:900;color:#0284c7;background:#f0f9ff;border:2px dashed #bae6fd;padding:14px 20px;border-radius:12px;text-align:center;margin:16px 0;">
          ${esc(code)}
        </div>
        <p style="color:#64748b;font-size:13px;text-align:center;margin:12px 0 0;">صالح لمدة 20 دقيقة. إذا لم تحاول تسجيل الدخول، فغيّر كلمة المرور فوراً.</p>
      </div>`;

    await sendMail(me.email, "Laundry Story - رمز الدخول", htmlBody);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر إرسال الرمز" }, 500);
  }
});
