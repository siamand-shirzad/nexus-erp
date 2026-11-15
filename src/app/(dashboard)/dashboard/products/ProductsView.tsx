"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  FileDown,
  Package,
  Archive,
  RotateCcw,
  Boxes,
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
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useCollection, useFiltered } from "@/lib/client";
import { exportReportPdf } from "@/lib/pdf";
import { formatCurrency, cn } from "@/lib/utils";
import type { Product, Role } from "@/db/schema";

const EMOJIS = ["📦", "🎧", "🔊", "🖥️", "⌨️", "🖱️", "🔌", "🔋", "📷", "💼", "🪑", "💺", "📓", "🖊️", "🗂️", "📡", "💽", "💾", "🗄️", "🧾", "🎙️", "🖼️", "🧵", "📶"];

type FormState = {
  name: string;
  sku: string;
  category: string;
  icon: string;
  price: string;
  cost: string;
  stock: string;
  reorderLevel: string;
  description: string;
  status: "active" | "archived";
};

const blank: FormState = {
  name: "",
  sku: "",
  category: "General",
  icon: "📦",
  price: "0",
  cost: "0",
  stock: "0",
  reorderLevel: "10",
  description: "",
  status: "active",
};

export function ProductsView({
  initialProducts,
  role,
}: {
  initialProducts: Product[];
  role: Role;
}) {
  const toast = useToast();
  const canManage = role !== "seller";
  const { data, loading, create, update, remove } = useCollection<Product>(
    "/api/products",
    initialProducts
  );

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(data.map((p) => p.category))).sort(),
    [data]
  );

  const filtered = useFiltered(
    data.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (stockFilter === "low" && !(p.stock <= p.reorderLevel)) return false;
      if (stockFilter === "out" && p.stock !== 0) return false;
      if (stockFilter === "archived" && p.status !== "archived") return false;
      if (stockFilter === "active" && p.status !== "active") return false;
      return true;
    }),
    query,
    ["name", "sku", "category", "description"]
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...blank, category: categories[0] ?? "General" });
    setModalOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      icon: p.icon,
      price: (p.price / 100).toFixed(2),
      cost: (p.cost / 100).toFixed(2),
      stock: String(p.stock),
      reorderLevel: String(p.reorderLevel),
      description: p.description ?? "",
      status: p.status,
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        price: Number(form.price),
        cost: Number(form.cost),
        stock: Number(form.stock),
        reorderLevel: Number(form.reorderLevel),
      };
      if (editing) {
        await update(editing.id, body, {
          ...editing,
          name: body.name,
          category: body.category,
          icon: body.icon,
          price: Math.round(body.price * 100),
          cost: Math.round(body.cost * 100),
          stock: body.stock,
          reorderLevel: body.reorderLevel,
          description: body.description,
          status: body.status,
        });
        toast.success("Product updated", body.name);
      } else {
        await create(body, {
          ...blank,
          id: `temp-${Date.now()}`,
          name: body.name,
          sku: body.sku || "SKU-…",
          category: body.category,
          icon: body.icon,
          price: Math.round(body.price * 100),
          cost: Math.round(body.cost * 100),
          stock: body.stock,
          reorderLevel: body.reorderLevel,
          description: body.description,
          status: body.status,
        } as unknown as Product);
        toast.success("Product created", body.name);
      }
      setModalOpen(false);
    } catch (e) {
      toast.error("Could not save product", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await remove(deleting.id);
      toast.success("Product deleted", deleting.name);
      setDeleting(null);
    } catch (e) {
      toast.error("Delete failed", e instanceof Error ? e.message : undefined);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function toggleArchive(p: Product) {
    const next = p.status === "archived" ? "active" : "archived";
    try {
      await update(p.id, { status: next }, { status: next });
      toast.success(next === "archived" ? "Product archived" : "Product restored", p.name);
    } catch (e) {
      toast.error("Action failed", e instanceof Error ? e.message : undefined);
    }
  }

  function exportPdf() {
    const inventoryValue = filtered
      .filter((p) => p.status === "active")
      .reduce((s, p) => s + p.cost * p.stock, 0);
    const lowCount = filtered.filter((p) => p.stock <= p.reorderLevel).length;
    exportReportPdf({
      filename: `products-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Product & Inventory Report",
      subtitle: `${filtered.length} products · Generated ${new Date().toLocaleString("en-US")}`,
      summary: [
        { label: "Products", value: String(filtered.length) },
        { label: "Inventory value", value: formatCurrency(inventoryValue) },
        { label: "Low stock", value: String(lowCount) },
      ],
      columns: ["SKU", "Product", "Category", "Unit Price", "Cost", "Stock", "Status"],
      rows: filtered.map((p) => [
        p.sku,
        p.name,
        p.category,
        formatCurrency(p.price),
        formatCurrency(p.cost),
        String(p.stock),
        p.status === "archived" ? "Archived" : p.stock <= p.reorderLevel ? "Low stock" : "In stock",
      ]),
    });
  }

  return (
    <div>
      <PageHeader
        title="Products & Inventory"
        description={`${data.length} products across ${categories.length} categories`}
        actions={
          <>
            <Button variant="secondary" onClick={exportPdf}>
              <FileDown className="h-4 w-4" /> Export
            </Button>
            {canManage && (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> New product
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search products, SKU…" className="sm:max-w-xs" />
        <div className="flex gap-2">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]}
            className="w-44"
          />
          <Select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            options={[
              { value: "all", label: "All stock" },
              { value: "active", label: "Active" },
              { value: "low", label: "Low stock" },
              { value: "out", label: "Out of stock" },
              { value: "archived", label: "Archived" },
            ]}
            className="w-40"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading && data.length === 0 ? (
          <TableSkeleton rows={8} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={data.length === 0 ? <Package className="h-7 w-7" /> : <Boxes className="h-7 w-7" />}
            title={data.length === 0 ? "No products yet" : "No products match"}
            description={
              data.length === 0
                ? "Add your first product to start building orders and invoices."
                : "Try adjusting your search or filters."
            }
            action={
              data.length === 0 && canManage ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Add product
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Product</th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 text-right font-semibold">Price</th>
                  <th className="px-3 py-3 text-right font-semibold">Margin</th>
                  <th className="px-3 py-3 font-semibold">Stock</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((p) => {
                  const low = p.stock <= p.reorderLevel;
                  const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
                  return (
                    <tr key={p.id} className="group transition-colors hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg">{p.icon}</span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">{p.name}</p>
                            <p className="text-[11px] text-slate-400">{p.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-slate-600">{p.category}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900 tnum">{formatCurrency(p.price)}</td>
                      <td className={cn("px-3 py-3 text-right text-[13px] tnum", margin >= 40 ? "text-emerald-600" : "text-slate-500")}>
                        {p.price > 0 ? `${margin}%` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-bold tnum",
                              p.status === "archived"
                                ? "bg-slate-100 text-slate-500"
                                : p.stock === 0
                                ? "bg-red-50 text-red-600"
                                : low
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                            )}
                          >
                            {p.stock}
                          </span>
                          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block">
                            <div
                              className={cn("h-full rounded-full", low ? "bg-amber-500" : "bg-emerald-500")}
                              style={{ width: `${Math.min(100, (p.stock / Math.max(p.reorderLevel * 2, 1)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {p.status === "archived" ? (
                          <Badge tone="slate">Archived</Badge>
                        ) : p.stock === 0 ? (
                          <Badge tone="red" dot>Out of stock</Badge>
                        ) : low ? (
                          <Badge tone="amber" dot>Low stock</Badge>
                        ) : (
                          <Badge tone="emerald" dot>Active</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canManage && (
                          <Dropdown
                            trigger={
                              <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                <MoreHorizontal className="h-4.5 w-4.5" />
                              </button>
                            }
                            items={[
                              { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(p) },
                              {
                                label: p.status === "archived" ? "Restore" : "Archive",
                                icon: p.status === "archived" ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />,
                                onClick: () => toggleArchive(p),
                              },
                              { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(p), danger: true },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit product" : "New product"}
        description={editing ? `Updating ${editing.name}` : "Add a new SKU to your catalog"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? "Save changes" : "Create product"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Aurora Wireless Headset" />
          </Field>
          <Field label="SKU" hint="Leave blank to auto-generate">
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} placeholder="AUD-1001" />
          </Field>
          <Field label="Category">
            <Input list="categories-list" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <datalist id="categories-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Unit price (USD)">
            <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          <Field label="Unit cost (USD)">
            <Input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </Field>
          <Field label="Stock on hand">
            <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </Field>
          <Field label="Reorder level">
            <Input type="number" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
          </Field>
          <Field label="Catalog icon" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setForm({ ...form, icon: e })}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-all",
                    form.icon === e ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Key features, warranty, notes…" />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}
              options={[
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
              ]}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        title="Delete product?"
        message={`${deleting?.name} will be permanently removed. Historical order line items keep their snapshot.`}
      />
    </div>
  );
}
