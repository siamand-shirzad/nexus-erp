"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  MoreHorizontal,
  FileDown,
  ShoppingCart,
  Eye,
  X,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  Button,
  Badge,
  Input,
  Select,
  Textarea,
  Field,
  Modal,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  TableSkeleton,
  SearchInput,
  PageHeader,
  Avatar,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useCollection, useFiltered } from "@/lib/client";
import { exportReportPdf } from "@/lib/pdf";
import { formatCurrency, formatDate, titleCase, cn } from "@/lib/utils";
import { orderStatusTone } from "@/components/ui";
import type { OrderRow } from "@/lib/dto";
import type { OrderStatus, Role } from "@/db/schema";

const STATUSES: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];
const TABS = [{ value: "all", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))];

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  icon: string;
  price: number;
  stock: number;
}
interface CustomerLite {
  id: string;
  label: string;
  city: string;
}
interface SellerLite {
  id: string;
  name: string;
  color: string;
  role: Role;
}

interface LineItem {
  productId: string;
  qty: number;
}

export function OrdersView({
  initialOrders,
  customers,
  products,
  sellers,
  selfId,
  role,
}: {
  initialOrders: OrderRow[];
  customers: CustomerLite[];
  products: ProductLite[];
  sellers: SellerLite[];
  selfId: string;
  role: Role;
}) {
  const toast = useToast();
  const router = useRouter();
  const canDelete = role !== "seller";
  const { data, loading, create, update, remove } = useCollection<OrderRow>(
    "/api/orders",
    initialOrders
  );

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<OrderRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [sellerId, setSellerId] = useState(selfId);
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [items, setItems] = useState<LineItem[]>([{ productId: "", qty: 1 }]);
  const [notes, setNotes] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");

  const filtered = useFiltered(
    data.filter((o) => tab === "all" || o.status === tab),
    query,
    ["orderNumber", "customerName", (o) => o.customerCompany ?? "", "sellerName"]
  );

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, i) => {
      const p = products.find((x) => x.id === i.productId);
      return s + (p ? p.price * i.qty : 0);
    }, 0);
    const tax = Math.round(subtotal * 0.0825);
    return { subtotal, tax, total: subtotal + tax };
  }, [items, products]);

  function openCreate() {
    setCustomerId(customers[0]?.id ?? "");
    setSellerId(selfId);
    setStatus("pending");
    setItems([{ productId: products[0]?.id ?? "", qty: 1 }]);
    setNotes("");
    setShippingAddress("");
    setModalOpen(true);
  }

  async function submit() {
    const valid = items.filter((i) => i.productId && i.qty > 0);
    if (!customerId) return toast.error("Choose a customer");
    if (!valid.length) return toast.error("Add at least one product");
    const stockIssue = valid.find((i) => {
      const p = products.find((x) => x.id === i.productId);
      return p && i.qty > p.stock;
    });
    if (stockIssue) {
      const p = products.find((x) => x.id === stockIssue.productId)!;
      return toast.error("Insufficient stock", `${p.name} has ${p.stock} on hand.`);
    }
    setSaving(true);
    try {
      const body = {
        customerId,
        sellerId,
        status,
        items: valid,
        notes,
        shippingAddress,
      };
      const temp: OrderRow = {
        id: `temp-${Date.now()}`,
        orderNumber: "ORD-…",
        customerId,
        sellerId,
        status,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: status === "cancelled" ? 0 : totals.total,
        shippingAddress: shippingAddress || null,
        notes: notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        customerName: customers.find((c) => c.id === customerId)?.label ?? "",
        customerCompany: null,
        sellerName: sellers.find((s) => s.id === sellerId)?.name ?? null,
        sellerColor: sellers.find((s) => s.id === sellerId)?.color ?? null,
        itemCount: valid.reduce((s, i) => s + i.qty, 0),
      };
      const created = await create(body, temp);
      toast.success("Order created", "The inventory and totals have been updated.");
      setModalOpen(false);
      if (created?.id && created.id.startsWith("temp-") === false) {
        router.push(`/dashboard/orders/${created.id}`);
      }
    } catch (e) {
      toast.error("Could not create order", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(o: OrderRow, next: OrderStatus) {
    if (next === o.status) return;
    try {
      await update(o.id, { status: next }, { status: next });
      toast.success(`Order ${o.orderNumber} → ${titleCase(next)}`);
    } catch (e) {
      toast.error("Status update failed", e instanceof Error ? e.message : undefined);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await remove(deleting.id);
      toast.success("Order deleted", deleting.orderNumber);
      setDeleting(null);
    } catch (e) {
      toast.error("Delete failed", e instanceof Error ? e.message : undefined);
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function exportPdf() {
    const revenue = filtered
      .filter((o) => o.status !== "cancelled")
      .reduce((s, o) => s + o.total, 0);
    exportReportPdf({
      filename: `orders-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Orders Report",
      subtitle: `${filtered.length} orders · Generated ${new Date().toLocaleString("en-US")}`,
      summary: [
        { label: "Orders", value: String(filtered.length) },
        { label: "Order value", value: formatCurrency(revenue) },
        {
          label: "Delivered",
          value: String(filtered.filter((o) => o.status === "delivered").length),
        },
      ],
      columns: ["Order #", "Customer", "Seller", "Date", "Items", "Status", "Total"],
      rows: filtered.map((o) => [
        o.orderNumber,
        o.customerCompany ?? o.customerName,
        o.sellerName ?? "—",
        formatDate(o.createdAt),
        String(o.itemCount),
        titleCase(o.status),
        o.status === "cancelled" ? "—" : formatCurrency(o.total),
      ]),
    });
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        description={`${data.length} orders in the pipeline`}
        actions={
          <>
            <Button variant="secondary" onClick={exportPdf}>
              <FileDown className="h-4 w-4" /> Export
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New order
            </Button>
          </>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search orders, customers…" className="sm:max-w-xs" />
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize transition-colors",
                tab === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading && data.length === 0 ? (
          <TableSkeleton rows={9} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={data.length === 0 ? <ShoppingCart className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
            title={data.length === 0 ? "No orders yet" : "No orders in this view"}
            description={
              data.length === 0
                ? "Create the first order to kick off your sales pipeline."
                : "Try another status tab or clear your search."
            }
            action={
              data.length === 0 ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Create order
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-3 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 font-semibold">Seller</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((o) => (
                  <tr key={o.id} className="group transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/orders/${o.id}`} className="font-semibold text-indigo-600 group-hover:underline">
                        {o.orderNumber}
                      </Link>
                      <p className="text-[11px] text-slate-400">{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{o.customerCompany ?? o.customerName}</p>
                      {o.customerCompany && <p className="text-[12px] text-slate-400">{o.customerName}</p>}
                    </td>
                    <td className="px-3 py-3">
                      {o.sellerName ? (
                        <span className="inline-flex items-center gap-2 text-[13px] text-slate-600">
                          <Avatar name={o.sellerName} color={o.sellerColor} size={24} />
                          <span className="hidden md:inline">{o.sellerName.split(" ")[0]}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-slate-500 tnum">{formatDate(o.createdAt)}</td>
                    <td className="px-3 py-3">
                      <Select
                        value={o.status}
                        onChange={(e) => changeStatus(o, e.target.value as OrderStatus)}
                        options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
                        className={cn(
                          "h-8 border-0 bg-transparent px-2 py-0 text-[12px] font-semibold shadow-none focus:ring-0",
                          "w-[132px] cursor-pointer"
                        )}
                      />
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900 tnum">
                      {o.status === "cancelled" ? "—" : formatCurrency(o.total)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Dropdown
                        trigger={
                          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <MoreHorizontal className="h-4.5 w-4.5" />
                          </button>
                        }
                        items={[
                          {
                            label: "Open order",
                            icon: <Eye className="h-4 w-4" />,
                            onClick: () => router.push(`/dashboard/orders/${o.id}`),
                          },
                          ...(canDelete
                            ? [{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(o), danger: true }]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create order modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create order"
        description="Pick a customer and add products. Totals include 8.25% sales tax."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Create order</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" required>
              <Select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const c = customers.find((x) => x.id === e.target.value);
                  if (c) setShippingAddress(c.city ? `${c.city}, United States` : "");
                }}
                options={customers.map((c) => ({ value: c.id, label: c.label }))}
              />
            </Field>
            <Field label="Sales rep">
              <Select
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                options={sellers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-700">Line items</span>
              <button
                type="button"
                onClick={() => setItems((it) => [...it, { productId: products[0]?.id ?? "", qty: 1 }])}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-indigo-600 hover:text-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const p = products.find((x) => x.id === item.productId);
                return (
                  <div key={idx} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-lg shadow-sm">
                      {p?.icon ?? "📦"}
                    </span>
                    <Select
                      value={item.productId}
                      onChange={(e) =>
                        setItems((it) => it.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))
                      }
                      options={products.map((p) => ({
                        value: p.id,
                        label: `${p.name} · ${formatCurrency(p.price)}${p.stock < 5 ? ` (only ${p.stock} left)` : ""}`,
                      }))}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) =>
                        setItems((it) => it.map((x, i) => (i === idx ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))
                      }
                      className="h-9 w-16 text-center"
                    />
                    <span className="w-20 text-right text-[13px] font-semibold text-slate-800 tnum">
                      {formatCurrency((p?.price ?? 0) * item.qty)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItems((it) => it.filter((_, i) => i !== idx))}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Initial status">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
                options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
              />
            </Field>
            <Field label="Shipping address">
              <Input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Street, City, State" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, PO references…" />
          </Field>

          <div className="rounded-xl bg-slate-900 p-4 text-white">
            <div className="space-y-1 text-[13px]">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal</span>
                <span className="tnum">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Sales tax (8.25%)</span>
                <span className="tnum">{formatCurrency(totals.tax)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-base font-bold">
                <span>Total</span>
                <span className="tnum">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        title="Delete order?"
        message={`${deleting?.orderNumber} will be permanently removed and stock will be returned to inventory. This can't be undone.`}
      />
    </div>
  );
}
