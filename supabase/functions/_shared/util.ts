import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const rawOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const ALLOWED = rawOrigin === "*" ? "*" : rawOrigin.trim().replace(/\/+$/, "");
export const cors = {
  "Access-Control-Allow-Origin": ALLOWED,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
export const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: cors });

// يحوّل 05xxxxxxxx إلى 9665xxxxxxxx ويرفض أي رقم غير سعودي جوال
export function normalizePhone(p: string): string | null {
  const d = String(p ?? "").replace(/\D/g, "");
  let n = d;
  if (n.startsWith("00966")) n = n.slice(5);
  else if (n.startsWith("966")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  return /^5\d{8}$/.test(n) ? "966" + n : null;
}

const enc = new TextEncoder();
async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(Deno.env.get("TOKEN_SECRET")!),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, "");
}
export async function sha256(s: string) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s + Deno.env.get("TOKEN_SECRET")));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}
// توكن قصير العمر يثبت أن البريد تم التحقق منه
const encSub = (x: string) => encodeURIComponent(x).replace(/\./g, "%2E");
export async function signToken(subject: string, ttlMs = 15 * 60_000) {
  const body = `${encSub(subject)}.${Date.now() + ttlMs}`;
  return `${body}.${await hmac(body)}`;
}
export async function checkToken(token: string, subject: string) {
  const [p, exp, sig] = String(token ?? "").split(".");
  if (!p || !exp || !sig || p !== encSub(subject) || Number(exp) < Date.now()) return false;
  return sig === await hmac(`${p}.${exp}`);
}

export const normalizeEmail = (e: string) => String(e ?? "").trim().toLowerCase();
export const validEmail = (e: string) => e.length <= 120 && /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(e);
export const esc = (x: unknown) => String(x ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// تشفير عنوان الرسالة بصيغة RFC 2047 Base64 لمنع أخطاء التنسيق مع الحروف العربية
function formatSubject(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

// إرسال الإيميل عبر Gmail بتنسيق HTML نظيف ومضبوط
export async function sendMail(to: string, subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER")!;
  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true,
      auth: { username: user, password: Deno.env.get("GMAIL_APP_PASSWORD")! } },
  });
  try {
    await client.send({
      from: `Laundry Story <${user}>`,
      to,
      subject: formatSubject(subject),
      html,
    });
  } finally {
    await client.close();
  }
}

// الأسعار تُحسب في السيرفر ولا يُوثق بسعر المتصفح
export const PRICES: Record<string, Record<string, number>> = {
  regular: { small: 30, medium: 35, large: 40 },
  deep: { small: 230, medium: 230, large: 280 },
};
export const PKG_NAMES: Record<string, string> = { regular: "باقة الغسيل العادي", deep: "باقة الغسيل العميق" };
export const SIZE_NAMES: Record<string, string> = { small: "سيارة صغيرة", medium: "سيارة وسط", large: "سيارة كبيرة" };
