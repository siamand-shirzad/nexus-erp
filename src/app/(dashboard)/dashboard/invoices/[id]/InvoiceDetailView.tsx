"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileDown,
  CheckCircle2,
  Ban,
  Send,
} from "lucide-react";
import {
  Card,
  Button,
  Badge,
  Select,
  invoiceStatusTone,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client";
import { exportInvoicePdf } from "@/lib/pdf";
import { formatCurrency, formatDate, titleCase } from "@/lib/utils";
import type { InvoiceDetail } from "@/lib/dto";
import type { InvoiceStatus, Role } from "@/db/schema";

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "overdue", "void"];

export function InvoiceDetailView({
  invoice: initial,
  role,
}: {
  invoice: InvoiceDetail;
  role: Role;
}) {
  const toast = useToast();
  const [invoice, setInvoice] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function patch(status: InvoiceStatus) {
    const snapshot = invoice;
    setInvoice({ ...invoice, status, paidAt: status === "paid" ? new Date() : null });
    try {
      const updated = await apiFetch<InvoiceDetail>(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setInvoice(updated);
      toast.success(`Invoice ${titleCase(status)}`, invoice.invoiceNumber);
    } catch (e) {
      setInvoice(snapshot);
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
    }
  }

  function download() {
    exportInvoicePdf({
      number: invoice.invoiceNumber,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      orderNumber: invoice.orderNumber,
      customer: {
        name: invoice.customerName,
        company: invoice.customerCompany,
        email: invoice.customerEmail,
        address: invoice.customerAddress,
      },
      items: invoice.items.map((i) => ({
        sku: i.sku,
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      subtotal: invoice.amount,
      tax: invoice.tax,
      total: invoice.amount + invoice.tax,
      sellerName: invoice.sellerName,
      notes: invoice.notes,
    });
  }

  async function resend() {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 700));
    setBusy(false);
    toast.success("Invoice sent", `Reminder delivered to ${invoice.customerCompany ?? invoice.customerName}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/invoices"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {invoice.invoiceNumber}
              </h1>
              <Badge tone={invoiceStatusTone[invoice.status]} dot>
                {titleCase(invoice.status)}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Order{" "}
              <Link href={`/dashboard/orders/${invoice.orderId}`} className="text-indigo-600 hover:underline">
                {invoice.orderNumber}
              </Link>{" "}
              · due {formatDate(invoice.dueDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={invoice.status}
            onChange={(e) => patch(e.target.value as InvoiceStatus)}
            options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
            className="w-36"
          />
          {invoice.status !== "paid" && (
            <Button onClick={() => patch("paid")}>
              <CheckCircle2 className="h-4 w-4" /> Mark paid
            </Button>
          )}
          <Button variant="secondary" onClick={download}>
            <FileDown className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Paper invoice */}
      <Card className="mx-auto max-w-3xl overflow-hidden">
        <div className="bg-indigo-600 px-8 py-7 text-white sm:px-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xl font-bold">Nexus ERP</p>
              <p className="mt-0.5 text-[13px] text-indigo-100">Business Operations Suite</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-tight">INVOICE</p>
              <p className="text-[13px] text-indigo-100">{invoice.invoiceNumber}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-8 py-7 sm:grid-cols-2 sm:px-10">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Billed to</p>
            <p className="mt-1.5 text-[15px] font-semibold text-slate-900">
              {invoice.customerCompany ?? invoice.customerName}
            </p>
            {invoice.customerCompany && (
              <p className="text-[13px] text-slate-600">Attn: {invoice.customerName}</p>
            )}
            {invoice.customerEmail && (
              <p className="mt-1 text-[13px] text-slate-500">{invoice.customerEmail}</p>
            )}
            {invoice.customerAddress && (
              <p className="text-[13px] text-slate-500">{invoice.customerAddress}</p>
            )}
          </div>
          <div className="sm:text-right">
            <dl className="space-y-1.5 text-[13px] sm:inline-block sm:text-left">
              {[
                ["Issued", formatDate(invoice.issuedAt)],
                ["Due", formatDate(invoice.dueDate)],
                ["Paid", invoice.paidAt ? formatDate(invoice.paidAt) : "—"],
                ["Account manager", invoice.sellerName ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-8">
                  <dt className="w-28 text-slate-400">{k}</dt>
                  <dd className="font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="px-8 sm:px-10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-2.5 pl-4 font-semibold">Item</th>
                <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                <th className="px-3 py-2.5 text-right font-semibold">Unit</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoice.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-3 pl-4">
                    <p className="font-medium text-slate-800">{i.name}</p>
                    <p className="text-[11px] text-slate-400">{i.sku}</p>
                  </td>
                  <td className="px-3 py-3 text-right tnum text-slate-600">{i.qty}</td>
                  <td className="px-3 py-3 text-right tnum text-slate-600">{formatCurrency(i.unitPrice)}</td>
                  <td className="py-3 pr-4 text-right font-semibold tnum">{formatCurrency(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-xs space-y-1.5 px-8 py-6 text-[13px] sm:px-10">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span className="tnum">{formatCurrency(invoice.amount)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Tax (8.25%)</span>
            <span className="tnum">{formatCurrency(invoice.tax)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-2.5 text-base font-bold text-slate-900">
            <span>Total due</span>
            <span className="tnum">{formatCurrency(invoice.amount + invoice.tax)}</span>
          </div>
          {invoice.status === "paid" && (
            <p className="pt-2 text-right text-[13px] font-semibold text-emerald-600">
              ✓ Paid in full
            </p>
          )}
        </div>

        <div className="mx-8 mb-8 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 sm:mx-10">
          {invoice.status === "draft" && (
            <Button size="sm" onClick={() => patch("sent")}>
              <Send className="h-3.5 w-3.5" /> Issue invoice
            </Button>
          )}
          {(invoice.status === "sent" || invoice.status === "overdue") && (
            <Button size="sm" variant="secondary" onClick={resend} loading={busy}>
              {!busy && <Send className="h-3.5 w-3.5" />} Send reminder
            </Button>
          )}
          {invoice.status !== "void" && invoice.status !== "paid" && role !== "seller" && (
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => patch("void")}>
              <Ban className="h-3.5 w-3.5" /> Void invoice
            </Button>
          )}
          <span className="ml-auto text-[12px] text-slate-400">
            Payment due within 14 days · Nexus ERP, Inc.
          </span>
        </div>
      </Card>
    </div>
  );
}
