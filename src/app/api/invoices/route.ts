import { db } from "@/db";
import { invoices, orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  logActivity,
} from "@/lib/api";
import { listInvoices } from "@/lib/queries";

async function nextInvoiceNumber() {
  const rows = (await db.execute(
    sql`SELECT MAX(invoice_number)::text AS max FROM invoices`
  )) as unknown as { rows: Array<{ max: string | null }> };
  const max = rows.rows[0]?.max;
  const n = max ? parseInt(max.replace(/\D/g, ""), 10) || 2000 : 2000;
  return `INV-${n + 1}`;
}

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  return ok(await listInvoices());
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const body = await readJson(req);
  const orderId = String(body.orderId ?? "");
  if (!orderId) return fail("Order is required.", 422);

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return fail("Order not found.", 404);
  if (order.status === "cancelled")
    return fail("Cannot invoice a cancelled order.", 422);

  const [duplicate] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.orderId, orderId))
    .limit(1);
  if (duplicate) return fail("This order already has an invoice.", 409);

  const invoiceNumber = await nextInvoiceNumber();
  const issued = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 14);

  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber,
      orderId,
      customerId: order.customerId,
      sellerId: order.sellerId,
      amount: order.subtotal,
      tax: order.tax,
      status: "sent",
      issuedAt: issued,
      dueDate: due,
    })
    .returning();

  await logActivity(
    session,
    "invoice.created",
    "invoice",
    `Issued ${invoiceNumber} for ${order.orderNumber}`
  );

  const [row] = (await listInvoices()).filter((i) => i.id === invoice.id);
  return ok(row ?? invoice, 201);
}
