"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  FileDown,
  ContactRound,
  Search as SearchIcon,
  MapPin,
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
  Avatar,
  PageHeader,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useCollection, useFiltered } from "@/lib/client";
import { exportReportPdf } from "@/lib/pdf";
import { formatCurrency, cn } from "@/lib/utils";
import { customerStatusTone } from "@/components/ui";
import type { CustomerRow } from "@/lib/dto";
import type { Role } from "@/db/schema";

interface Owner {
  id: string;
  name: string;
  color: string;
  role: Role;
}

type FormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  status: "active" | "lead" | "churned";
  ownerId: string;
  notes: string;
};

const blank: FormState = {
  name: "",
  company: "",
  email: "",
  phone: "",
  city: "",
  status: "lead",
  ownerId: "",
  notes: "",
};

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "lead", label: "Leads" },
  { value: "churned", label: "Churned" },
];

export function CustomersView({
  initialCustomers,
  owners,
  role,
}: {
  initialCustomers: CustomerRow[];
  owners: Owner[];
  role: Role;
}) {
  const toast = useToast();
  const canDelete = role !== "seller";
  const { data, loading, create, update, remove } = useCollection<CustomerRow>(
    "/api/customers",
    initialCustomers
  );
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useFiltered(
    data.filter((c) => tab === "all" || c.status === tab),
    query,
    ["name", "company", "email", "city"]
  );

  const ownerOf = (id: string | null) => owners.find((o) => o.id === id);

  function openCreate() {
    setEditing(null);
    setForm({ ...blank, ownerId: owners[0]?.id ?? "" });
    setModalOpen(true);
  }
  function openEdit(c: CustomerRow) {
    setEditing(c);
    setForm({
      name: c.name,
      company: c.company ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      city: c.city ?? "",
      status: c.status,
      ownerId: c.ownerId ?? "",
      notes: c.notes ?? "",
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Contact name is required");
    setSaving(true);
    try {
      const body = { ...form };
      if (editing) {
        await update(editing.id, body, {
          ...editing,
          name: body.name,
          company: body.company || null,
          email: body.email || null,
          phone: body.phone || null,
          city: body.city || null,
          status: body.status,
          ownerId: body.ownerId || null,
          notes: body.notes || null,
        });
        toast.success("Customer updated", body.company || body.name);
      } else {
        await create(body, {
          id: `temp-${Date.now()}`,
          name: body.name,
          company: body.company || null,
          email: body.email || null,
          phone: body.phone || null,
          city: body.city || null,
          country: "United States",
          status: body.status,
          ownerId: body.ownerId || null,
          notes: body.notes || null,
          createdAt: new Date(),
          ownerName: ownerOf(body.ownerId)?.name ?? null,
          ownerColor: ownerOf(body.ownerId)?.color ?? null,
          orderCount: 0,
          lifetimeValue: 0,
        } as unknown as CustomerRow);
        toast.success("Customer added", body.company || body.name);
      }
      setModalOpen(false);
    } catch (e) {
      toast.error("Could not save customer", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await remove(deleting.id);
      toast.success("Customer deleted", deleting.company ?? deleting.name);
      setDeleting(null);
    } catch (e) {
      toast.error(
        "Cannot delete customer",
        e instanceof Error ? e.message : "This customer has linked orders."
      );
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function exportPdf() {
    const totalLtv = filtered.reduce((s, c) => s + c.lifetimeValue, 0);
    exportReportPdf({
      filename: `customers-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Customer Directory",
      subtitle: `${filtered.length} records · Generated ${new Date().toLocaleString("en-US")}`,
      summary: [
        { label: "Customers", value: String(filtered.length) },
        { label: "Leads", value: String(filtered.filter((c) => c.status === "lead").length) },
        { label: "Lifetime value", value: formatCurrency(totalLtv) },
      ],
      columns: ["Company / Contact", "Email", "Location", "Owner", "Status", "Orders", "Lifetime value"],
      rows: filtered.map((c) => [
        c.company ? `${c.company} (${c.name})` : c.name,
        c.email ?? "—",
        c.city ?? "—",
        c.ownerName ?? "—",
        c.status,
        String(c.orderCount),
        formatCurrency(c.lifetimeValue),
      ]),
      totals: ["", "", "", "", `Total (${filtered.length})`, "", formatCurrency(totalLtv)],
    });
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${data.length} accounts · ${data.filter((c) => c.status === "lead").length} open leads`}
        actions={
          <>
            <Button variant="secondary" onClick={exportPdf}>
              <FileDown className="h-4 w-4" /> Export
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New customer
            </Button>
          </>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
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
          <TableSkeleton rows={8} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ContactRound className="h-7 w-7" />}
            title={data.length === 0 ? "No customers yet" : "Nothing matches your filters"}
            description={
              data.length === 0
                ? "Add your first customer to start creating orders for them."
                : "Try a different search term or status tab."
            }
            action={
              data.length === 0 ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Add customer
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 font-semibold">Contact</th>
                  <th className="px-3 py-3 font-semibold">Location</th>
                  <th className="px-3 py-3 font-semibold">Owner</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Orders</th>
                  <th className="px-3 py-3 text-right font-semibold">Lifetime value</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.company ?? c.name} color="#4f46e5" size={36} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{c.company ?? c.name}</p>
                          {c.company && <p className="text-[12px] text-slate-400">{c.name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-[13px] text-slate-600">{c.email ?? "—"}</p>
                      <p className="text-[12px] text-slate-400">{c.phone ?? ""}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-[13px] text-slate-600">
                        <MapPin className="h-3.5 w-3.5 text-slate-300" />
                        {c.city ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {c.ownerName ? (
                        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-700">
                          <Avatar name={c.ownerName} color={c.ownerColor} size={26} />
                          {c.ownerName.split(" ")[0]}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={customerStatusTone[c.status]} dot>
                        {c.status === "lead" ? "Lead" : c.status[0].toUpperCase() + c.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right tnum text-slate-700">{c.orderCount}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900 tnum">
                      {formatCurrency(c.lifetimeValue, { compact: true })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Dropdown
                        trigger={
                          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <MoreHorizontal className="h-4.5 w-4.5" />
                          </button>
                        }
                        items={[
                          { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(c) },
                          ...(canDelete
                            ? [{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(c), danger: true }]
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit customer" : "New customer"}
        description="Track the company, contact details and account owner."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? "Save changes" : "Create customer"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company">
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme, Inc." />
          </Field>
          <Field label="Contact name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="City, State">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Austin, TX" />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}
              options={[
                { value: "active", label: "Active" },
                { value: "lead", label: "Lead" },
                { value: "churned", label: "Churned" },
              ]}
            />
          </Field>
          <Field label="Account owner">
            <Select
              value={form.ownerId}
              onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
              placeholder="Unassigned"
              options={owners.map((o) => ({ value: o.id, label: `${o.name} · ${o.role}` }))}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Conversation history, terms, preferences…" />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        title="Delete customer?"
        message={`${deleting?.company ?? deleting?.name} will be removed. Customers with existing orders can't be deleted until those orders are removed.`}
      />
    </div>
  );
}
