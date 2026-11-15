"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trash2,
  Receipt,
  FileDown,
  CheckCircle2,
  MapPin,
  Mail,
  Phone,
  Building2,
  User,
  ClipboardList,
  Ban,
} from "lucide-react";
import {
  Card,
  Button,
  Badge,
  Select,
  Textarea,
  ConfirmDialog,
  orderStatusTone,
  invoiceStatusTone,
  IconBadge,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client";
import { exportInvoicePdf } from "@/lib/pdf";
import { formatCurrency, formatDate, titleCase, cn } from "@/lib/utils";
import type { OrderDetailRow, InvoiceRow, InvoiceDetail } from "@/lib/dto";
import type { OrderStatus, Role } from "@/db/schema";

const STEPS: OrderStatus[] = ["pending", "processing", "shipped", "delivered"];

export function OrderDetailView({
  initialOrder,
  initialInvoice,
  sellers,
  role,
}: {
  initialOrder: OrderDetailRow;
  initialInvoice: InvoiceRow | null;
  sellers: Array<{ id: string; name: string; color: string; role: Role }>;
  role: Role;
}) {
  const toast = useToast();
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(initialInvoice);
  const [notes, setNotes] = useState(initialOrder.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function patch(patch: Record<string, unknown>, optimistic?: Partial<OrderDetailRow>) {
    const snapshot = order;
    if (optimistic) setOrder((o) => ({ ...o, ...optimistic }));
    try {
      const updated = await apiFetch<OrderDetailRow>(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setOrder(updated);
      return updated;
    } catch (e) {
      setOrder(snapshot);
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
      throw e;
    }
  }

  async function setStatus(next: OrderStatus) {
    if (next === order.status) return;
    try {
      const u = await patch({ status: next }, { status: next, total: next === "cancelled" ? 0 : order.subtotal + order.tax });
      if (u) setOrder(u);
      toast.success(`Marked ${titleCase(next)}`, order.orderNumber);
    } catch {
      /* rollback handled */
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await patch({ notes });
      toast.success("Notes saved");
    } finally {
      setSavingNotes(false);
    }
  }

  async function assignSeller(sellerId: string) {
    const seller = sellers.find((s) => s.id === sellerId);
    await patch(
      { sellerId },
      { sellerId, sellerName: seller?.name ?? null, sellerColor: seller?.color ?? null }
    );
  }

  async function generateInvoice() {
    setBusy(true);
    try {
      const created = await apiFetch<InvoiceRow>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      });
      setInvoice(created);
      toast.success("Invoice issued", created.invoiceNumber);
    } catch (e) {
      toast.error("Could not create invoice", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function downloadInvoice() {
    if (!invoice) return;
    try {
      const detail = await apiFetch<InvoiceDetail>(`/api/invoices/${invoice.id}`);
      exportInvoicePdf({
        number: detail.invoiceNumber,
        status: detail.status,
        issuedAt: detail.issuedAt,
        dueDate: detail.dueDate,
        paidAt: detail.paidAt,
        orderNumber: detail.orderNumber,
        customer: {
          name: detail.customerName,
          company: detail.customerCompany,
          email: detail.customerEmail,
          address: detail.customerAddress,
        },
        items: detail.items.map((i) => ({
          sku: i.sku,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
        subtotal: detail.amount,
        tax: detail.tax,
        total: detail.amount + detail.tax,
        sellerName: detail.sellerName,
        notes: detail.notes,
      });
    } catch (e) {
      toast.error("Export failed", e instanceof Error ? e.message : undefined);
    }
  }

  async function markPaid() {
    if (!invoice) return;
    const snapshot = invoice;
    setInvoice({ ...invoice, status: "paid", paidAt: new Date() });
    try {
      const updated = await apiFetch<InvoiceRow>(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "paid" }),
      });
      setInvoice(updated);
      toast.success("Payment recorded", invoice.invoiceNumber);
    } catch (e) {
      setInvoice(snapshot);
      toast.error("Could not record payment", e instanceof Error ? e.message : undefined);
    }
  }

  async function deleteOrder() {
    setDeleting(true);
    try {
      await apiFetch(`/api/orders/${order.id}`, { method: "DELETE" });
      toast.success("Order deleted", order.orderNumber);
      router.push("/dashboard/orders");
      router.refresh();
    } catch (e) {
      toast.error("Delete failed", e instanceof Error ? e.message : undefined);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const currentStep = STEPS.indexOf(order.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/orders"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{order.orderNumber}</h1>
              <Badge tone={orderStatusTone[order.status]} dot>
                {titleCase(order.status)}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Placed {formatDate(order.createdAt)} ·{" "}
              {order.customerCompany ?? order.customerName}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {role !== "seller" && (
            <Button variant="secondary" className="text-red-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Status stepper */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="grid flex-1 grid-cols-4 gap-2">
            {STEPS.map((step, i) => {
              const active = order.status === step;
              const done = currentStep > i;
              return (
                <button
                  key={step}
                  onClick={() => setStatus(step)}
                  className="group flex flex-col items-center gap-2 text-center"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-all",
                      active
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-200"
                        : done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-200 bg-white text-slate-400 group-hover:border-slate-300"
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4.5 w-4.5" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-[11.5px] font-semibold capitalize",
                      active ? "text-indigo-700" : done ? "text-emerald-700" : "text-slate-400"
                    )}
                  >
                    {step}
                  </span>
                </button>
              );
            })}
          </div>
          {order.status !== "cancelled" ? (
            <Button variant="secondary" size="sm" onClick={() => setStatus("cancelled")}>
              <Ban className="h-3.5 w-3.5" /> Cancel order
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setStatus("pending")}>
              Reopen order
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Items + totals */}
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-900">Line items</h3>
            <span className="text-xs text-slate-400">{order.items.length} product{order.items.length === 1 ? "" : "s"}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-5 py-2.5 font-semibold">Item</th>
                <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                <th className="px-3 py-2.5 text-right font-semibold">Unit</th>
                <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{i.name}</p>
                    <p className="text-[11px] text-slate-400">{i.sku}</p>
                  </td>
                  <td className="px-3 py-3 text-right tnum text-slate-600">{i.qty}</td>
                  <td className="px-3 py-3 text-right tnum text-slate-600">{formatCurrency(i.unitPrice)}</td>
                  <td className="px-5 py-3 text-right font-semibold tnum text-slate-900">{formatCurrency(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
            <div className="flex justify-between text-[13px] text-slate-500">
              <span>Subtotal</span>
              <span className="tnum">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-[13px] text-slate-500">
              <span>Sales tax (8.25%)</span>
              <span className="tnum">{formatCurrency(order.tax)}</span>
            </div>
            <div className="flex justify-between pt-1.5 text-[15px] font-bold text-slate-900">
              <span>Total</span>
              <span className="tnum">{order.status === "cancelled" ? "Cancelled" : formatCurrency(order.total)}</span>
            </div>
          </div>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Customer</h3>
            <div className="space-y-2.5 text-[13px] text-slate-600">
              <p className="flex items-center gap-2.5 font-semibold text-slate-800">
                <Building2 className="h-4 w-4 text-slate-400" />
                {order.customerCompany ?? order.customerName}
              </p>
              {order.customerCompany && (
                <p className="flex items-center gap-2.5">
                  <User className="h-4 w-4 text-slate-400" /> {order.customerName}
                </p>
              )}
              {order.customerEmail && (
                <p className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-slate-400" /> {order.customerEmail}
                </p>
              )}
              {order.customerPhone && (
                <p className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-slate-400" /> {order.customerPhone}
                </p>
              )}
              {order.shippingAddress && (
                <p className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 text-slate-400" /> {order.shippingAddress}
                </p>
              )}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                Sales rep
              </label>
              <Select
                value={order.sellerId ?? ""}
                onChange={(e) => assignSeller(e.target.value)}
                placeholder="Unassigned"
                options={sellers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <IconBadge tone="indigo" size={34}>
                <Receipt className="h-4.5 w-4.5" />
              </IconBadge>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Invoice</h3>
                <p className="text-xs text-slate-400">Billing & payment</p>
              </div>
            </div>
            {invoice ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <Link href={`/dashboard/invoices/${invoice.id}`} className="text-[13px] font-semibold text-indigo-600 hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                  <Badge tone={invoiceStatusTone[invoice.status]} dot>
                    {titleCase(invoice.status)}
                  </Badge>
                </div>
                <p className="text-[12px] text-slate-400">
                  Due {formatDate(invoice.dueDate)} · {formatCurrency(invoice.amount + invoice.tax)}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={downloadInvoice}>
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </Button>
                  {invoice.status !== "paid" && (
                    <Button size="sm" className="flex-1" onClick={markPaid}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-dashed border-slate-200 px-3.5 py-5 text-center">
                  <p className="text-[13px] text-slate-500">No invoice has been issued yet.</p>
                </div>
                <Button className="w-full" onClick={generateInvoice} loading={busy} disabled={order.status === "cancelled"}>
                  {!busy && <Receipt className="h-4 w-4" />}
                  Generate invoice
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Notes */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ClipboardList className="h-4 w-4 text-slate-400" /> Internal notes
          </h3>
          <Button variant="secondary" size="sm" onClick={saveNotes} loading={savingNotes}>
            Save notes
          </Button>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add delivery instructions, call logs or special terms…"
          className="min-h-[90px]"
        />
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteOrder}
        loading={deleting}
        title="Delete order?"
        message={`${order.orderNumber} and its invoice will be permanently deleted, and stock will be returned. This can't be undone.`}
      />
    </div>
  );
}
