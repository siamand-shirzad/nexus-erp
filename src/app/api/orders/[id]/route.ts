import { db } from "@/db";
import { orders, orderItems, products } from "@/db/schema";
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
import { listOrders } from "@/lib/queries";
import type { OrderStatus } from "@/db/schema";

const STATUSES: OrderStatus[] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!existing) return notFound();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (STATUSES.includes(body.status) && body.status !== existing.status) {
    const newStatus = body.status as OrderStatus;
    patch.status = newStatus;
    // Restock when cancelling an order that consumed inventory
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    if (newStatus === "cancelled" && existing.status !== "pending") {
      for (const item of items) {
        if (!item.productId) continue;
        await db
          .update(products)
          .set({ stock: sql`${products.stock} + ${item.qty}`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
      }
      patch.total = 0;
    }
    if (existing.status === "cancelled" && newStatus !== "cancelled") {
      for (const item of items) {
        if (!item.productId) continue;
        await db
          .update(products)
          .set({ stock: sql`GREATEST(${products.stock} - ${item.qty}, 0)`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
      }
      patch.total = sql`${orders.subtotal} + ${orders.tax}`;
    }
    await logActivity(
      session,
      "order.status",
      "order",
      `Marked ${existing.orderNumber} as ${newStatus.replace("_", " ")}`
    );
  }
  if (typeof body.notes === "string") patch.notes = body.notes.trim() || null;
  if (typeof body.shippingAddress === "string")
    patch.shippingAddress = body.shippingAddress.trim() || null;
  if (typeof body.sellerId === "string") patch.sellerId = body.sellerId || null;
  if (typeof body.customerId === "string") patch.customerId = body.customerId;

  await db.update(orders).set(patch).where(eq(orders.id, id));

  const [row] = (await listOrders()).filter((o) => o.id === id);
  return ok(row ?? { success: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const { id } = await ctx.params;

  const [existing] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!existing) return notFound();

  try {
    if (existing.status !== "cancelled" && existing.status !== "pending") {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, id));
      for (const item of items) {
        if (!item.productId) continue;
        await db
          .update(products)
          .set({ stock: sql`${products.stock} + ${item.qty}`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
      }
    }
    await db.delete(orders).where(eq(orders.id, id));
    await logActivity(session, "order.deleted", "order", `Deleted order ${existing.orderNumber}`);
    return ok({ success: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to delete order", 500);
  }
}
