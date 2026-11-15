import { db } from "@/db";
import { orders, orderItems, products, customers } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
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

async function nextOrderNumber() {
  const rows = (await db.execute(
    sql`SELECT MAX(order_number)::text AS max FROM orders`
  )) as unknown as { rows: Array<{ max: string | null }> };
  const max = rows.rows[0]?.max;
  const n = max ? parseInt(max.replace(/\D/g, ""), 10) || 1000 : 1000;
  return `ORD-${n + 1}`;
}

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  return ok(await listOrders());
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const body = await readJson(req);

  const customerId = String(body.customerId ?? "");
  const rawItems: Array<{ productId?: string; qty?: number }> = Array.isArray(
    body.items
  )
    ? body.items
    : [];
  if (!customerId) return fail("Please choose a customer.", 422);
  if (!rawItems.length) return fail("Add at least one product to the order.", 422);

  const [customer] = await db
    .select({ id: customers.id, company: customers.company, name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) return fail("Customer not found.", 404);

  const productIds = rawItems.map((i) => String(i.productId ?? ""));
  const productRows = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));
  const productMap = new Map(productRows.map((p) => [p.id, p]));

  interface BuiltItem {
    productId: string;
    name: string;
    sku: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }
  const built: BuiltItem[] = [];
  for (const raw of rawItems) {
    const p = productMap.get(String(raw.productId));
    const qty = Math.max(1, Math.round(Number(raw.qty) || 1));
    if (!p) return fail("One of the selected products no longer exists.", 422);
    built.push({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      qty,
      unitPrice: p.price,
      lineTotal: p.price * qty,
    });
  }

  const status: OrderStatus = STATUSES.includes(body.status)
    ? body.status
    : "pending";
  const subtotal = built.reduce((s, i) => s + i.lineTotal, 0);
  const tax = Math.round(subtotal * 0.0825);
  const total = subtotal + tax;
  const orderNumber = await nextOrderNumber();

  try {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          customerId,
          sellerId: body.sellerId || session.sub,
          status,
          subtotal,
          tax,
          total: status === "cancelled" ? 0 : total,
          shippingAddress: String(body.shippingAddress ?? "").trim() || null,
          notes: String(body.notes ?? "").trim() || null,
        })
        .returning();

      for (const item of built) {
        await tx.insert(orderItems).values({ orderId: order.id, ...item });
      }
      if (status !== "cancelled") {
        for (const item of built) {
          await tx
            .update(products)
            .set({ stock: sql`GREATEST(${products.stock} - ${item.qty}, 0)`, updatedAt: new Date() })
            .where(eq(products.id, item.productId));
        }
      }
      return order;
    });

    await logActivity(
      session,
      "order.created",
      "order",
      `Created order ${orderNumber} for ${customer.company ?? customer.name}`
    );

    const [created] = (await listOrders()).filter((o) => o.id === result.id);
    return ok(created ?? result, 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to create order", 500);
  }
}
