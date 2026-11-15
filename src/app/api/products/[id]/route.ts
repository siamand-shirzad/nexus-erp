import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  forbidden,
  notFound,
  logActivity,
  ValidationError,
} from "@/lib/api";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) return notFound();

  try {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.description === "string") patch.description = body.description.trim() || null;
    if (typeof body.category === "string" && body.category.trim()) patch.category = body.category.trim();
    if (typeof body.icon === "string" && body.icon.trim()) patch.icon = body.icon.trim();
    if (body.price !== undefined) {
      const n = Number(body.price);
      if (Number.isNaN(n) || n < 0) throw new ValidationError("Price must be positive.");
      patch.price = Math.round(n * 100);
    }
    if (body.cost !== undefined) {
      const n = Number(body.cost);
      if (Number.isNaN(n) || n < 0) throw new ValidationError("Cost must be positive.");
      patch.cost = Math.round(n * 100);
    }
    if (body.stock !== undefined) {
      const n = Number(body.stock);
      if (Number.isNaN(n) || n < 0) throw new ValidationError("Stock must be positive.");
      patch.stock = Math.round(n);
    }
    if (body.reorderLevel !== undefined) {
      const n = Number(body.reorderLevel);
      if (Number.isNaN(n) || n < 0) throw new ValidationError("Reorder level must be positive.");
      patch.reorderLevel = Math.round(n);
    }
    if (["active", "archived"].includes(body.status)) patch.status = body.status;

    const [row] = await db
      .update(products)
      .set(patch)
      .where(eq(products.id, id))
      .returning();
    await logActivity(session, "product.updated", "product", `Updated product ${row.name}`);
    return ok(row);
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message, 422);
    return fail("Failed to update product.", 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const { id } = await ctx.params;

  const [existing] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) return notFound();

  await db.delete(products).where(eq(products.id, id));
  await logActivity(session, "product.deleted", "product", `Removed product ${existing.name}`);
  return ok({ success: true });
}
