"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";
import {
  deleteBankAccountAction,
  deleteImportAction,
  resolveDuplicateAction,
  saveBankAccountAction,
} from "@/lib/accounting/actions";
import { Label, useAct, type Option } from "@/components/accounting/kit";
import { btn, btnDanger, btnPrimary, input } from "@/components/accounting/ui";

export interface BankForm {
  id: string;
  name: string;
  kind: string;
  accountId: string;
  bankName: string | null;
  accountNumber: string | null;
  isActive: boolean;
}
const blank = { name: "", kind: "bank" as "bank" | "cash", accountId: "", bankName: "", accountNumber: "", isActive: true };

/** "New account" button, or an edit/delete pair when `bank` is given. */
export function BankAccountEditor({ bank, ledgerAccounts }: { bank?: BankForm; ledgerAccounts: Option[] }) {
  const act = useAct();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  function show() {
    act.clear();
    setForm(
      bank
        ? { name: bank.name, kind: bank.kind as "bank" | "cash", accountId: bank.accountId, bankName: bank.bankName ?? "", accountNumber: bank.accountNumber ?? "", isActive: bank.isActive }
        : blank
    );
    setOpen(true);
  }
  async function save() {
    if (await act.run(() => saveBankAccountAction(form, bank?.id), "Saved")) setOpen(false);
  }

  return (
    <>
      {bank ? (
        <>
          <button type="button" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" aria-label={`Edit ${bank.name}`} onClick={show}>
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
            aria-label={`Remove ${bank.name}`}
            disabled={act.busy}
            onClick={() =>
              confirm(`Remove ${bank.name}? Its ledger account and entries are kept.`) &&
              act.run(() => deleteBankAccountAction(bank.id), "Removed")
            }
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button type="button" className={btnPrimary} onClick={show}>
          <Plus className="h-4 w-4" /> New bank or cash account
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={bank ? `Edit ${bank.name}` : "New bank or cash account"}
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
          <Label label="Name" error={act.err("name")}>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Label>
          <Label label="Kind" error={act.err("kind")}>
            <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "bank" | "cash" })}>
              <option value="bank">Bank account</option>
              <option value="cash">Cash</option>
            </select>
          </Label>
          <Label label="Ledger account" error={act.err("accountId")} className="sm:col-span-2">
            <select className={input} value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              <option value="">Choose an asset account…</option>
              {ledgerAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[12px] font-normal text-slate-500">
              Each bank or cash account posts to its own asset account. Create it in Chart of Accounts first if needed.
            </span>
          </Label>
          <Label label="Bank name (optional)">
            <input className={input} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </Label>
          <Label label="Account number (optional)">
            <input className={input} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          </Label>
          <label className="flex items-center gap-2 text-[13px] text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
          </label>
        </div>
      </Modal>
    </>
  );
}

export function DeleteImportButton({ id, filename }: { id: string; filename: string }) {
  const act = useAct();
  return (
    <button
      type="button"
      className={btnDanger + " h-7 px-2"}
      disabled={act.busy}
      onClick={() =>
        confirm(`Delete the import "${filename}" and its statement lines? Journal entries are not affected.`) &&
        act.run(() => deleteImportAction(id), "Import deleted")
      }
    >
      Delete
    </button>
  );
}

export function DuplicateReview({ id }: { id: string }) {
  const act = useAct();
  return (
    <span className="flex gap-2">
      <button type="button" className={btn + " h-7 px-2"} disabled={act.busy} onClick={() => act.run(() => resolveDuplicateAction(id, "keep"), "Kept as a separate transaction")}>
        Keep
      </button>
      <button type="button" className={btnDanger + " h-7 px-2"} disabled={act.busy} onClick={() => act.run(() => resolveDuplicateAction(id, "delete"), "Duplicate removed")}>
        Remove
      </button>
    </span>
  );
}
