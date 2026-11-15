import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  forbidden,
  notFound,
  logActivity,
} from "@/lib/api";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const [existing] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!existing) return notFound();

  const patch: Record<string, unknown> = {};
  for (const key of ["name", "company", "email", "phone", "city", "country", "notes"] as const) {
    if (body[key] !== undefined)
      patch[key] = typeof body[key] === "string" ? body[key].trim() || null : body[key];
  }
  if (["active", "lead", "churned"].includes(body.status)) patch.status = body.status;
  if (body.ownerId !== undefined) patch.ownerId = body.ownerId || null;

  const [row] = await db
    .update(customers)
    .set(patch)
    .where(eq(customers.id, id))
    .returning();
  await logActivity(session, "customer.updated", "customer", `Updated ${row.company ?? row.name}`);
  return ok(row);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const { id } = await ctx.params;

  const [existing] = await db
    .select({
      id: customers.id,
      name: customers.name,
      company: customers.company,
    })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!existing) return notFound();

  const orderCountRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.customerId, id));
  const orderCount = Number(orderCountRows[0]?.c ?? 0);
  if (orderCount > 0) {
    return fail(
      `${existing.company ?? existing.name} has ${orderCount} order(s). Delete those orders before removing the customer.`,
      409
    );
  }

  await db.delete(customers).where(eq(customers.id, id));
  await logActivity(
    session,
    "customer.deleted",
    "customer",
    `Removed customer ${existing.company ?? existing.name}`
  );
  return ok({ success: true });
}
