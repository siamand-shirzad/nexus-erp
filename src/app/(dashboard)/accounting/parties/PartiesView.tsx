"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { deletePartyAction, savePartyAction } from "@/lib/accounting/actions";
import { formatAmount } from "@/lib/accounting/money";
import { Label, useAct } from "@/components/accounting/kit";
import { Empty, Panel, Pill, Table, btn, btnPrimary, input, linkCls, rowCls, td, tdR, th, thR, totalRow } from "@/components/accounting/ui";

export interface PartyView {
  id: string;
  name: string;
  phone: string | null;
  code: string | null;
  notes: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  isActive: boolean;
  receivable: number;
  payable: number;
}
const blank = { name: "", phone: "", code: "", notes: "", isCustomer: true, isSupplier: false, isActive: true };

export function PartiesView({ parties, decimals }: { parties: PartyView[]; decimals: number }) {
  const act = useAct();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PartyView | null>(null);
  const [form, setForm] = useState(blank);
  const fmt = (n: number) => formatAmount(n, decimals);

  const q = query.trim().toLowerCase();
  const visible = parties.filter(
    (p) => !q || [p.name, p.code, p.phone].some((v) => v?.toLowerCase().includes(q))
  );

  function openForm(p?: PartyView) {
    act.clear();
    setEditing(p ?? null);
    setForm(p ? { name: p.name, phone: p.phone ?? "", code: p.code ?? "", notes: p.notes ?? "", isCustomer: p.isCustomer, isSupplier: p.isSupplier, isActive: p.isActive } : blank);
    setOpen(true);
  }
  async function save() {
    if (await act.run(() => savePartyAction(form, editing?.id), editing ? "Party updated" : "Party added")) setOpen(false);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input className={input + " max-w-xs"} placeholder="Search name, code or phone" aria-label="Search parties" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className={btnPrimary + " ml-auto"} onClick={() => openForm()}>
          <Plus className="h-4 w-4" /> New party
        </button>
      </div>
      <Panel>
        {visible.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Code</th>
                <th className={th}>Phone</th>
                <th className={th}>Role</th>
                <th className={thR}>Receivable (owes you)</th>
                <th className={thR}>Payable (you owe)</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className={rowCls + (p.isActive ? "" : " opacity-60")}>
                  <td className={td}>
                    <Link href={`/accounting/parties/${p.id}`} className={linkCls}>
                      {p.name}
                    </Link>
                  </td>
                  <td className={td}>{p.code}</td>
                  <td className={td}>{p.phone}</td>
                  <td className={td}>
                    <span className="flex flex-wrap gap-1">
                      {p.isCustomer && <Pill tone="indigo">Customer</Pill>}
                      {p.isSupplier && <Pill tone="amber">Supplier</Pill>}
                      {!p.isActive && <Pill tone="red">Inactive</Pill>}
                    </span>
                  </td>
                  <td className={tdR}>{fmt(p.receivable)}</td>
                  <td className={tdR}>{fmt(p.payable)}</td>
                  <td className={td + " whitespace-nowrap text-right"}>
                    <button type="button" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" aria-label={`Edit ${p.name}`} onClick={() => openForm(p)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      aria-label={`Delete ${p.name}`}
                      disabled={act.busy}
                      onClick={() => confirm(`Delete ${p.name}?`) && act.run(() => deletePartyAction(p.id), "Party deleted")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className={totalRow}>
                <td className={td} colSpan={4}>
                  Total
                </td>
                <td className={tdR}>{fmt(visible.reduce((s, p) => s + p.receivable, 0))}</td>
                <td className={tdR}>{fmt(visible.reduce((s, p) => s + p.payable, 0))}</td>
                <td />
              </tr>
            </tbody>
          </Table>
        ) : (
          <Empty>{parties.length ? "No parties match." : "No customers, suppliers or other parties yet."}</Empty>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "New party"}
        footer={
          <>
            <button type="button" className={btn} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={save} disabled={act.busy}>
              {act.busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Name" error={act.err("name")} className="sm:col-span-2">
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Label>
          <Label label="Phone (optional)">
            <input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Label>
          <Label label="Reference code (optional)" error={act.err("code")}>
            <input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Label>
          <Label label="Notes" className="sm:col-span-2">
            <textarea className={input + " h-20 py-2"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Label>
          <div className="flex flex-wrap gap-4 text-[13px] text-slate-700 sm:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isCustomer} onChange={(e) => setForm({ ...form, isCustomer: e.target.checked })} /> Customer
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isSupplier} onChange={(e) => setForm({ ...form, isSupplier: e.target.checked })} /> Supplier
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
            </label>
          </div>
        </div>
      </Modal>
    </>
  );
}
