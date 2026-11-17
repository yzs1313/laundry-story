import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const ALLOWED = (Deno.env.get("ALLOWED_ORIGIN") ?? "*");
export const cors = {
  "Access-Control-Allow-Origin": ALLOWED,
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
// توكن قصير العمر يثبت أن الجوال تم التحقق منه
export async function signToken(phone: string, ttlMs = 15 * 60_000) {
  const body = `${phone}.${Date.now() + ttlMs}`;
  return `${body}.${await hmac(body)}`;
}
export async function checkToken(token: string, phone: string) {
  const [p, exp, sig] = String(token ?? "").split(".");
  if (!p || !exp || !sig || p !== phone || Number(exp) < Date.now()) return false;
  return sig === await hmac(`${p}.${exp}`);
}

// الأسعار تُحسب في السيرفر ولا يُوثق بسعر المتصفح
export const PRICES: Record<string, Record<string, number>> = {
  regular: { small: 30, medium: 35, large: 40 },
  deep: { small: 230, medium: 230, large: 280 },
};
export const PKG_NAMES: Record<string, string> = { regular: "باقة الغسيل العادي", deep: "باقة الغسيل العميق" };
export const SIZE_NAMES: Record<string, string> = { small: "سيارة صغيرة", medium: "سيارة وسط", large: "سيارة كبيرة" };
