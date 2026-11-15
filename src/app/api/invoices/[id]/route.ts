import { db } from "@/db";
import { invoices } from "@/db/schema";
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
} from "@/lib/api";
import { getInvoiceDetail, listInvoices } from "@/lib/queries";

const STATUSES = ["draft", "sent", "paid", "overdue", "void"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const { id } = await ctx.params;
  const detail = await getInvoiceDetail(id);
  if (!detail) return notFound();
  return ok(detail);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const [existing] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  if (!existing) return notFound();

  const patch: Record<string, unknown> = {};
  if (STATUSES.includes(body.status)) {
    patch.status = body.status;
    patch.paidAt = body.status === "paid" ? existing.paidAt ?? new Date() : null;
    await logActivity(
      session,
      "invoice.status",
      "invoice",
      body.status === "paid"
        ? `Recorded payment for ${existing.invoiceNumber}`
        : `Marked ${existing.invoiceNumber} as ${body.status}`
    );
  }

  await db.update(invoices).set(patch).where(eq(invoices.id, id));
  const [row] = (await listInvoices()).filter((i) => i.id === id);
  return ok(row ?? { success: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const { id } = await ctx.params;

  const [existing] = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  if (!existing) return notFound();

  await db.delete(invoices).where(eq(invoices.id, id));
  await logActivity(session, "invoice.deleted", "invoice", `Voided and deleted ${existing.invoiceNumber}`);
  return ok({ success: true });
}
