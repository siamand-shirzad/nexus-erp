import { db } from "@/db";
import { users, teamMembers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  forbidden,
  notFound,
  logActivity
  DEMO,
  demoLocked,
} from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { listTeamMembers } from "@/lib/queries";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role !== "admin") return forbidden();
  if (DEMO) return demoLocked();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!existing) return notFound();

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.title === "string") patch.title = body.title.trim() || null;
  if (typeof body.department === "string") patch.department = body.department.trim() || null;
  if (typeof body.phone === "string") patch.phone = body.phone.trim() || null;
  if (typeof body.avatarColor === "string") patch.avatarColor = body.avatarColor;
  if (["admin", "manager", "seller"].includes(body.role)) {
    if (session.sub === id && body.role !== "admin") {
      return fail("You can't change your own admin role.", 422);
    }
    patch.role = body.role;
  }
  if (["active", "disabled"].includes(body.status)) {
    if (session.sub === id && body.status === "disabled") {
      return fail("You can't deactivate your own account.", 422);
    }
    if (existing.role === "admin" && body.status === "disabled") {
      const adminCount = (
        (await db.execute(
          sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND status = 'active'`
        )) as unknown as { rows: Array<{ c: number }> }
      ).rows[0].c;
      if (Number(adminCount) <= 1)
        return fail("At least one active admin is required.", 422);
    }
    patch.status = body.status;
  }
  if (typeof body.password === "string" && body.password.length >= 6) {
    patch.passwordHash = await hashPassword(body.password);
  }
  if (typeof body.email === "string" && body.email.includes("@")) {
    patch.email = body.email.trim().toLowerCase();
  }

  try {
    await db.update(users).set(patch).where(eq(users.id, id));
  } catch (e) {
    if ((e as { code?: string })?.code === "23505")
      return fail("A user with that email already exists.", 409);
    return fail("Failed to update user.", 500);
  }

  await logActivity(session, "team.updated", "team", `Updated profile for ${existing.name}`);
  const [row] = (await listTeamMembers()).filter((m) => m.id === id);
  return ok(row ?? { success: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role !== "admin") return forbidden();
  if (DEMO) return demoLocked();
  const { id } = await ctx.params;
  if (session.sub === id) return fail("You can't delete your own account.", 422);

  const [existing] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!existing) return notFound();

  const linked = (
    (await db.execute(
      sql`SELECT
        (SELECT COUNT(*) FROM orders WHERE seller_id = ${id})::int AS orders,
        (SELECT COUNT(*) FROM customers WHERE owner_id = ${id})::int AS customers`
    )) as unknown as { rows: Array<{ orders: number; customers: number }> }
  ).rows[0];

  if (Number(linked.orders) > 0 || Number(linked.customers) > 0) {
    // Keep records intact: deactivate instead of hard delete
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, id));
    await logActivity(
      session,
      "team.updated",
      "team",
      `Deactivated ${existing.name}'s account (history preserved)`
    );
    return ok({ success: true, deactivated: true });
  }

  await db.delete(teamMembers).where(eq(teamMembers.userId, id));
  await db.delete(users).where(eq(users.id, id));
  await logActivity(session, "team.deleted", "team", `Removed ${existing.name} from the team`);
  return ok({ success: true, deleted: true });
}
