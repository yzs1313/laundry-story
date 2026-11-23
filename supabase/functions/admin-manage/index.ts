import { admin, authAdmin, cors, json, normalizeEmail, validEmail } from "../_shared/util.ts";

const ROLES = ["super_admin", "manager", "dispatcher", "washer"];

// يبحث عن مستخدم الدخول بالإيميل (عدد الحسابات صغير)
async function findAuthUser(db: ReturnType<typeof admin>, email: string) {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x: any) => String(x.email ?? "").toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await authAdmin(req);
    if (!me) return json({ error: "غير مصرح" }, 401);
    const db = admin();

    // للمدير العام فقط، وفي جلسة أُكمل فيها رمز الإيميل
    const { data: myRow } = await db.from("admin_users").select("role,status").eq("email", me.email).maybeSingle();
    if (!myRow || myRow.status !== "active" || myRow.role !== "super_admin") return json({ error: "الصلاحية للمدير العام فقط" }, 403);
    const { data: f } = await db.from("admin_2fa").select("verified_at").eq("session_id", me.sessionId).maybeSingle();
    if (!f?.verified_at || Date.now() - new Date(f.verified_at).getTime() > 12 * 3600_000) return json({ error: "أكمل رمز التحقق أولاً" }, 403);

    const b = await req.json();
    const email = normalizeEmail(b.email);
    if (!validEmail(email)) return json({ error: "البريد الإلكتروني غير صحيح" }, 400);

    if (b.action === "create") {
      const password = String(b.password ?? "");
      const name = String(b.name ?? "").trim().slice(0, 80);
      const phone = String(b.phone ?? "").replace(/\s/g, "");
      if (!name) return json({ error: "الاسم مطلوب" }, 400);
      if (!/^\+?\d{9,15}$/.test(phone)) return json({ error: "رقم الجوال غير صحيح" }, 400);
      if (!ROLES.includes(b.role)) return json({ error: "الرتبة غير صحيحة" }, 400);
      if (password.length < 8 || password.toLowerCase() === email) return json({ error: "كلمة المرور 8 أحرف على الأقل" }, 400);

      const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (cErr || !created?.user) {
        if (/already|registered|exists/i.test(String(cErr?.message))) return json({ error: "هذا البريد مسجل مسبقاً" }, 409);
        throw cErr ?? new Error("create failed");
      }
      const { error: iErr } = await db.from("admin_users").insert({ name, email, phone, role: b.role, status: "active" });
      if (iErr) {
        await db.auth.admin.deleteUser(created.user.id);   // تراجع كامل إذا فشل حفظ الصلاحية
        if (iErr.code === "23505") return json({ error: "البريد أو الجوال مسجل مسبقاً" }, 409);
        throw iErr;
      }
      return json({ ok: true });
    }

    if (b.action === "set_password") {
      const password = String(b.password ?? "");
      if (password.length < 8 || password.toLowerCase() === email) return json({ error: "كلمة المرور 8 أحرف على الأقل" }, 400);
      const { data: row } = await db.from("admin_users").select("id").eq("email", email).maybeSingle();
      const user = row ? await findAuthUser(db, email) : null;
      if (!user) return json({ error: "الحساب غير موجود" }, 404);
      const { error } = await db.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
      return json({ ok: true });
    }

    if (b.action === "delete") {
      if (email === me.email) return json({ error: "لا يمكنك حذف حسابك أنت" }, 400);
      const { data: target } = await db.from("admin_users").select("id,role").eq("email", email).maybeSingle();
      if (!target) return json({ error: "الحساب غير موجود" }, 404);
      if (target.role === "super_admin") {
        const { count } = await db.from("admin_users").select("id", { count: "exact", head: true }).eq("role", "super_admin").eq("status", "active");
        if ((count ?? 0) <= 1) return json({ error: "لا يمكن حذف آخر مدير عام" }, 400);
      }
      await db.from("admin_users").delete().eq("id", target.id);
      const user = await findAuthUser(db, email);
      if (user) await db.auth.admin.deleteUser(user.id);   // يحذف حساب الدخول نفسه
      return json({ ok: true });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر تنفيذ الطلب" }, 500);
  }
});
