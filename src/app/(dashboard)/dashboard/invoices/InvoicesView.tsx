"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileDown,
  Receipt,
  MoreHorizontal,
  Eye,
  CheckCircle2,
  Ban,
  Trash2,
  AlertCircle,
  FileText,
} from "lucide-react";
import {
  Card,
  Button,
  Badge,
  EmptyState,
  TableSkeleton,
  SearchInput,
  PageHeader,
  Dropdown,
  ConfirmDialog,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useCollection, useFiltered, apiFetch } from "@/lib/client";
import { exportReportPdf, exportInvoicePdf } from "@/lib/pdf";
import { formatCurrency, formatDate, titleCase, cn, isOverdue } from "@/lib/utils";
import { invoiceStatusTone } from "@/components/ui";
import type { InvoiceRow, InvoiceDetail } from "@/lib/dto";
import type { InvoiceStatus, Role } from "@/db/schema";

const TABS = ["all", "draft", "sent", "overdue", "paid", "void"];

export function InvoicesView({
  initialInvoices,
  role,
}: {
  initialInvoices: InvoiceRow[];
  role: Role;
}) {
  const toast = useToast();
  const router = useRouter();
  const canDelete = role !== "seller";
  const { data, loading, update, remove } = useCollection<InvoiceRow>(
    "/api/invoices",
    initialInvoices
  );
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [deleting, setDeleting] = useState<InvoiceRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filtered = useFiltered(
    data.filter((i) => {
      if (tab !== "all" && i.status !== tab) return false;
      // Surface overdue sent invoices in the overdue tab too
      if (tab === "overdue") return i.status === "overdue";
      return true;
    }),
    query,
    ["invoiceNumber", "orderNumber", "customerName", (i) => i.customerCompany ?? ""]
  );

  async function setStatus(inv: InvoiceRow, status: InvoiceStatus) {
    try {
      await update(inv.id, { status }, { status, paidAt: status === "paid" ? new Date() : inv.paidAt });
      toast.success(`Invoice ${inv.invoiceNumber} → ${titleCase(status)}`);
    } catch (e) {
      toast.error("Action failed", e instanceof Error ? e.message : undefined);
    }
  }

  async function download(inv: InvoiceRow) {
    setDownloadingId(inv.id);
    try {
      const detail = await apiFetch<InvoiceDetail>(`/api/invoices/${inv.id}`);
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
    } finally {
      setDownloadingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await remove(deleting.id);
      toast.success("Invoice deleted", deleting.invoiceNumber);
      setDeleting(null);
    } catch (e) {
      toast.error("Delete failed", e instanceof Error ? e.message : undefined);
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function exportReport() {
    const outstanding = filtered
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((s, i) => s + i.amount + i.tax, 0);
    const paid = filtered.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount + i.tax, 0);
    exportReportPdf({
      filename: `invoices-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Accounts Receivable Report",
      subtitle: `${filtered.length} invoices · Generated ${new Date().toLocaleString("en-US")}`,
      summary: [
        { label: "Invoices", value: String(filtered.length) },
        { label: "Paid", value: formatCurrency(paid) },
        { label: "Outstanding", value: formatCurrency(outstanding) },
      ],
      columns: ["Invoice #", "Order #", "Customer", "Issued", "Due", "Status", "Amount"],
      rows: filtered.map((i) => [
        i.invoiceNumber,
        i.orderNumber,
        i.customerCompany ?? i.customerName,
        formatDate(i.issuedAt),
        formatDate(i.dueDate),
        titleCase(i.status),
        formatCurrency(i.amount + i.tax),
      ]),
      totals: ["", "", "", "", "Outstanding", "", formatCurrency(outstanding)],
    });
  }

  const outstandingTotal = data
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + i.amount + i.tax, 0);
  const overdueTotal = data
    .filter((i) => i.status === "overdue")
    .reduce((s, i) => s + i.amount + i.tax, 0);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={`${formatCurrency(outstandingTotal, { compact: false })} outstanding · ${formatCurrency(overdueTotal)} overdue`}
        actions={
          <Button variant="secondary" onClick={exportReport}>
            <FileDown className="h-4 w-4" /> Export report
          </Button>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search invoices, customers…" className="sm:max-w-xs" />
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize transition-colors",
                tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading && data.length === 0 ? (
          <TableSkeleton rows={8} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={data.length === 0 ? <Receipt className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
            title={data.length === 0 ? "No invoices yet" : "No invoices in this view"}
            description={
              data.length === 0
                ? "Generate an invoice from any order and it will appear here with PDF support."
                : "Try another status tab or a different search."
            }
            action={
              data.length === 0 ? (
                <Button onClick={() => router.push("/dashboard/orders")}>
                  <FileText className="h-4 w-4" /> Go to orders
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-3 py-3 font-semibold">Order</th>
                  <th className="px-3 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 font-semibold">Issued</th>
                  <th className="px-3 py-3 font-semibold">Due</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((inv) => {
                  const overdue =
                    inv.status === "sent" && inv.dueDate && isOverdue(inv.dueDate);
                  return (
                    <tr key={inv.id} className="group transition-colors hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/invoices/${inv.id}`} className="font-semibold text-indigo-600 group-hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/dashboard/orders/${inv.orderId}`} className="text-[13px] text-slate-500 hover:text-indigo-600">
                          {inv.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800">{inv.customerCompany ?? inv.customerName}</p>
                        {inv.customerCompany && <p className="text-[12px] text-slate-400">{inv.customerName}</p>}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-500 tnum">{formatDate(inv.issuedAt)}</td>
                      <td className={cn("px-3 py-3 text-[13px] tnum", overdue ? "font-semibold text-red-600" : "text-slate-500")}>
                        {formatDate(inv.dueDate)}
                        {overdue && <span className="ml-1.5 text-[10px] font-bold uppercase">due</span>}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={overdue ? "red" : invoiceStatusTone[inv.status]} dot>
                          {overdue ? "Overdue" : titleCase(inv.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900 tnum">
                        {formatCurrency(inv.amount + inv.tax)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Dropdown
                          trigger={
                            <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                              <MoreHorizontal className="h-4.5 w-4.5" />
                            </button>
                          }
                          items={[
                            {
                              label: "Open",
                              icon: <Eye className="h-4 w-4" />,
                              onClick: () => router.push(`/dashboard/invoices/${inv.id}`),
                            },
                            {
                              label: downloadingId === inv.id ? "Preparing…" : "Download PDF",
                              icon: <FileDown className="h-4 w-4" />,
                              onClick: () => download(inv),
                            },
                            ...(inv.status !== "paid" && inv.status !== "void"
                              ? [
                                  {
                                    label: "Mark paid",
                                    icon: <CheckCircle2 className="h-4 w-4" />,
                                    onClick: () => setStatus(inv, "paid"),
                                  },
                                ]
                              : []),
                            ...(inv.status !== "void" && inv.status !== "paid"
                              ? [
                                  {
                                    label: "Void",
                                    icon: <Ban className="h-4 w-4" />,
                                    onClick: () => setStatus(inv, "void"),
                                  },
                                ]
                              : []),
                            ...(canDelete
                              ? [
                                  {
                                    label: "Delete",
                                    icon: <Trash2 className="h-4 w-4" />,
                                    onClick: () => setDeleting(inv),
                                    danger: true,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        title="Delete invoice?"
        message={`${deleting?.invoiceNumber} will be permanently removed. The linked order is not affected.`}
      />
    </div>
  );
}
