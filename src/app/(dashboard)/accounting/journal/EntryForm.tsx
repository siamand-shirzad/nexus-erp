"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveEntryAction, deleteDraftAction } from "@/lib/accounting/actions";
import { amountToInput, formatAmount, parseAmount } from "@/lib/accounting/money";
import { AmountInput, Combo, FieldError, Label, useAct, type Option } from "@/components/accounting/kit";
import { Panel, btn, btnDanger, btnPrimary, input, th, thR } from "@/components/accounting/ui";

export interface FormAccount extends Option {
  requiresParty: boolean;
}
interface Row {
  key: number;
  accountId: string;
  partyId: string;
  debit: string;
  credit: string;
  description: string;
}
export interface EntryInitial {
  id: string;
  date: string;
  description: string;
  reference: string;
  kind: string;
  lines: Array<{ accountId: string; partyId: string | null; debit: number; credit: number; description: string | null }>;
}

let nextKey = 1;
const blank = (): Row => ({ key: nextKey++, accountId: "", partyId: "", debit: "", credit: "", description: "" });
const isEmpty = (r: Row) => !r.accountId && !r.partyId && !r.debit.trim() && !r.credit.trim() && !r.description.trim();

export function EntryForm({
  accounts,
  parties,
  decimals,
  today,
  initial,
}: {
  accounts: FormAccount[];
  parties: Option[];
  decimals: number;
  today: string;
  initial?: EntryInitial;
}) {
  const router = useRouter();
  const act = useAct();
  const [date, setDate] = useState(initial?.date ?? today);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [kind, setKind] = useState(initial?.kind === "opening" ? "opening" : "manual");
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.lines.length
      ? initial.lines.map((l) => ({
          key: nextKey++,
          accountId: l.accountId,
          partyId: l.partyId ?? "",
          debit: l.debit ? amountToInput(l.debit, decimals) : "",
          credit: l.credit ? amountToInput(l.credit, decimals) : "",
          description: l.description ?? "",
        }))
      : [blank(), blank()]
  );
  // one key per form instance: a double submission returns the first entry instead of creating two
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  // server issues refer to submitted line indexes; this maps them back to visible rows
  const [submitted, setSubmitted] = useState<number[]>([]);
  const [localError, setLocalError] = useState("");

  const set = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const amount = (text: string) => (text.trim() ? parseAmount(text, decimals) : 0);
  const bad = (text: string) => {
    const v = amount(text);
    return v === null || v < 0;
  };
  const totalDebit = rows.reduce((s, r) => s + (amount(r.debit) ?? 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (amount(r.credit) ?? 0), 0);
  const difference = totalDebit - totalCredit;
  const rowErr = (visibleIndex: number, field: string) => {
    const i = submitted.indexOf(visibleIndex);
    return i < 0 ? undefined : act.err(`lines.${i}.${field}`);
  };

  async function save(post: boolean) {
    setLocalError("");
    if (rows.some((r) => bad(r.debit) || bad(r.credit))) {
      setLocalError(`Fix the highlighted amounts. Use digits with up to ${decimals} decimal place(s).`);
      return;
    }
    const kept = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isEmpty(r));
    if (kept.some(({ r }) => !r.accountId)) {
      setLocalError("Choose an account on every line, or clear the line.");
      return;
    }
    setSubmitted(kept.map((k) => k.i));
    const result = await act.run(
      () =>
        saveEntryAction(
          {
            date,
            description,
            reference,
            kind,
            idempotencyKey: initial ? null : idempotencyKey,
            lines: kept.map(({ r }) => ({
              accountId: r.accountId,
              partyId: r.partyId || null,
              debit: amount(r.debit) ?? 0,
              credit: amount(r.credit) ?? 0,
              description: r.description,
            })),
          },
          { id: initial?.id, post }
        ),
      post ? "Entry posted" : "Draft saved"
    );
    if (result) router.push(`/accounting/journal/${result.data.id}`);
  }

  async function remove() {
    if (!initial || !confirm("Delete this draft? This cannot be undone.")) return;
    if (await act.run(() => deleteDraftAction(initial.id), "Draft deleted")) router.push("/accounting/journal");
  }

  return (
    <form
      // Enter never posts by accident: posting is the explicit button or Ctrl+Enter
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save(true);
        }
      }}
    >
      <Panel>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Label label="Date" error={act.err("date")}>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </Label>
          <Label label="Description" error={act.err("description")} className="lg:col-span-2">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={input}
              placeholder="What happened"
              autoFocus={!initial}
            />
          </Label>
          <Label label="Reference (optional)">
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} placeholder="Document or cheque no." />
          </Label>
          <Label label="Type">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
              <option value="manual">Manual entry</option>
              <option value="opening">Opening balances</option>
            </select>
          </Label>
          {kind === "opening" && (
            <p className="self-end text-[12px] text-slate-500 sm:col-span-1 lg:col-span-3">
              Enter each starting balance on its own line (with the party for receivables and payables) and
              balance the entry against Opening Balance Equity.
            </p>
          )}
        </div>

        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th} style={{ width: "28%" }}>Account</th>
                <th className={th} style={{ width: "18%" }}>Party</th>
                <th className={th}>Line description</th>
                <th className={thR} style={{ width: "13%" }}>Debit</th>
                <th className={thR} style={{ width: "13%" }}>Credit</th>
                <th className={th} style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const account = accounts.find((a) => a.id === r.accountId);
                return (
                  <tr key={r.key} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-1.5">
                      <Combo
                        options={accounts}
                        value={r.accountId}
                        onChange={(id) => set(r.key, { accountId: id })}
                        ariaLabel={`Line ${i + 1} account`}
                        placeholder="Code or name"
                        invalid={!!rowErr(i, "accountId")}
                      />
                      <FieldError message={rowErr(i, "accountId")} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Combo
                        options={parties}
                        value={r.partyId}
                        onChange={(id) => set(r.key, { partyId: id })}
                        ariaLabel={`Line ${i + 1} party`}
                        placeholder={account?.requiresParty ? "Required" : "Optional"}
                        invalid={!!rowErr(i, "partyId")}
                      />
                      <FieldError message={rowErr(i, "partyId")} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className={input}
                        value={r.description}
                        aria-label={`Line ${i + 1} description`}
                        onChange={(e) => set(r.key, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <AmountInput
                        value={r.debit}
                        ariaLabel={`Line ${i + 1} debit`}
                        invalid={bad(r.debit) || !!rowErr(i, "amount")}
                        onChange={(v) => set(r.key, { debit: v, credit: v.trim() ? "" : r.credit })}
                      />
                      <FieldError message={rowErr(i, "amount")} />
                    </td>
                    <td className="px-2 py-1.5">
                      <AmountInput
                        value={r.credit}
                        ariaLabel={`Line ${i + 1} credit`}
                        invalid={bad(r.credit) || !!rowErr(i, "amount")}
                        onChange={(v) => set(r.key, { credit: v, debit: v.trim() ? "" : r.debit })}
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <button
                        type="button"
                        className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"
                        aria-label={`Remove line ${i + 1}`}
                        disabled={rows.length <= 2}
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-2 py-2" colSpan={3}>
                  <button type="button" className={btn} onClick={() => setRows((rs) => [...rs, blank()])}>
                    <Plus className="h-4 w-4" /> Add line
                  </button>
                </td>
                <td className="px-3 py-2 text-right tnum">{formatAmount(totalDebit, decimals)}</td>
                <td className="px-3 py-2 text-right tnum">{formatAmount(totalCredit, decimals)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <div className="text-[13px]" aria-live="polite">
            {difference === 0 ? (
              <span className="font-medium text-emerald-700">Debits and credits are equal.</span>
            ) : (
              <span className="font-medium text-red-700">
                Out of balance by {formatAmount(Math.abs(difference), decimals)} (
                {difference > 0 ? "debits exceed credits" : "credits exceed debits"}).
              </span>
            )}
            <FieldError message={localError || act.err("lines")} />
          </div>
          <div className="flex flex-wrap gap-2">
            {initial && (
              <button type="button" className={btnDanger} onClick={remove} disabled={act.busy}>
                Delete draft
              </button>
            )}
            <button type="button" className={btn} onClick={() => save(false)} disabled={act.busy}>
              Save draft
            </button>
            <button type="button" className={btnPrimary} onClick={() => save(true)} disabled={act.busy} aria-keyshortcuts="Control+Enter">
              {act.busy ? "Saving…" : "Post entry"}
              <kbd className="hidden rounded bg-indigo-500 px-1 text-[10px] font-normal sm:inline">Ctrl+Enter</kbd>
            </button>
          </div>
        </div>
      </Panel>
    </form>
  );
}
