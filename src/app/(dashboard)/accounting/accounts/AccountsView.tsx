"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { deleteAccountAction, saveAccountAction } from "@/lib/accounting/actions";
import { formatAmount } from "@/lib/accounting/money";
import type { AccCategory } from "@/db/accounting-schema";
import { Label, useAct } from "@/components/accounting/kit";
import { Empty, Panel, Pill, Table, btn, btnPrimary, input, ledgerHref, linkCls, rowCls, td, tdR, th, thR } from "@/components/accounting/ui";

export interface AccountView {
  id: string;
  code: string;
  name: string;
  category: AccCategory;
  parentId: string | null;
  isActive: boolean;
  isPosting: boolean;
  requiresParty: boolean;
  postable: boolean;
  depth: number;
  lineCount: number;
  childCount: number;
  balance: number; // debit-positive, includes sub-accounts
}

const CATEGORY: Record<AccCategory, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};
const blank = { code: "", name: "", category: "asset" as AccCategory, parentId: "", isActive: true, isPosting: true, requiresParty: false };

export function AccountsView({ accounts, decimals }: { accounts: AccountView[]; decimals: number }) {
  const act = useAct();
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<AccountView | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const q = query.trim().toLowerCase();
  const visible = accounts.filter(
    (a) => (showInactive || a.isActive) && (!q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
  );

  function openForm(a?: AccountView, parent?: AccountView) {
    act.clear();
    setEditing(a ?? null);
    setForm(
      a
        ? { code: a.code, name: a.name, category: a.category, parentId: a.parentId ?? "", isActive: a.isActive, isPosting: a.isPosting, requiresParty: a.requiresParty }
        : { ...blank, category: parent?.category ?? "asset", parentId: parent?.id ?? "" }
    );
    setOpen(true);
  }
  async function save() {
    const r = await act.run(
      () => saveAccountAction({ ...form, parentId: form.parentId || null }, editing?.id),
      editing ? "Account updated" : "Account created"
    );
    if (r) setOpen(false);
  }
  async function remove(a: AccountView) {
    if (!confirm(`Delete account ${a.code} ${a.name}?`)) return;
    await act.run(() => deleteAccountAction(a.id), "Account deleted");
  }
  const parentChoices = accounts.filter((a) => a.category === form.category && a.id !== editing?.id);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          className={input + " max-w-xs"}
          placeholder="Search code or name"
          aria-label="Search accounts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex items-center gap-2 text-[13px] text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <button type="button" className={btnPrimary + " ml-auto"} onClick={() => openForm()}>
          <Plus className="h-4 w-4" /> New account
        </button>
      </div>

      <Panel>
        {visible.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Name</th>
                <th className={th}>Category</th>
                <th className={th}>Type</th>
                <th className={thR}>Balance</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id} className={rowCls + (a.isActive ? "" : " opacity-60")}>
                  <td className={td + " tnum font-medium"}>{a.code}</td>
                  <td className={td}>
                    <span style={{ paddingLeft: q ? 0 : a.depth * 18 }} className={a.postable ? "" : "font-semibold text-slate-900"}>
                      {a.name}
                    </span>
                  </td>
                  <td className={td}>{CATEGORY[a.category]}</td>
                  <td className={td}>
                    <span className="flex flex-wrap gap-1">
                      {a.postable ? <Pill tone="indigo">Posting</Pill> : <Pill tone="slate">Summary</Pill>}
                      {a.requiresParty && <Pill tone="amber">Party required</Pill>}
                      {!a.isActive && <Pill tone="red">Inactive</Pill>}
                    </span>
                  </td>
                  <td className={tdR}>
                    <Link href={ledgerHref({ account: a.id })} className={linkCls} title="Open ledger">
                      {a.balance === 0
                        ? formatAmount(0, decimals)
                        : `${formatAmount(Math.abs(a.balance), decimals)} ${a.balance > 0 ? "Dr" : "Cr"}`}
                    </Link>
                  </td>
                  <td className={td + " whitespace-nowrap text-right"}>
                    {!a.lineCount && (
                      <button type="button" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" aria-label={`Add sub-account under ${a.code}`} title="Add sub-account" onClick={() => openForm(undefined, a)}>
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" aria-label={`Edit ${a.code}`} title="Edit" onClick={() => openForm(a)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"
                      aria-label={`Delete ${a.code}`}
                      title={a.lineCount ? "Has journal lines: deactivate instead" : a.childCount ? "Has sub-accounts" : "Delete"}
                      disabled={!!a.lineCount || !!a.childCount || act.busy}
                      onClick={() => remove(a)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>No accounts match.</Empty>
        )}
      </Panel>
      <p className="mt-2 text-[12px] text-slate-500">
        Balances are debits minus credits of posted entries (Dr = debit balance, Cr = credit balance). Summary
        accounts show the total of their sub-accounts.
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit account ${editing.code}` : "New account"}
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
          <Label label="Code" error={act.err("code")}>
            <input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} autoFocus />
          </Label>
          <Label label="Name" error={act.err("name")}>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Label>
          <Label label="Category" error={act.err("category")}>
            <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as AccCategory, parentId: "" })}>
              {Object.entries(CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Label>
          <Label label="Parent account" error={act.err("parentId")}>
            <select className={input} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">None (top level)</option>
              {parentChoices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </Label>
          <div className="space-y-2 text-[13px] text-slate-700 sm:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isPosting} onChange={(e) => setForm({ ...form, isPosting: e.target.checked })} />
              Posting allowed (untick for a summary account that only groups sub-accounts)
            </label>
            {act.err("isPosting") && <p className="text-[12px] font-medium text-red-700">{act.err("isPosting")}</p>}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.requiresParty} onChange={(e) => setForm({ ...form, requiresParty: e.target.checked })} />
              Party required on every line (receivable, payable and similar control accounts)
            </label>
            {act.err("requiresParty") && <p className="text-[12px] font-medium text-red-700">{act.err("requiresParty")}</p>}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (inactive accounts keep their history but accept no new entries)
            </label>
          </div>
        </div>
      </Modal>
    </>
  );
}
