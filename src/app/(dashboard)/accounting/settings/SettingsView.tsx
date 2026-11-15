"use client";

import { useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Modal } from "@/components/ui";
import {
  clearDemoAction,
  closeFiscalYearAction,
  createFiscalYearAction,
  deleteFiscalYearAction,
  loadDemoAction,
  lockPeriodAction,
  previewClosingAction,
  reopenFiscalYearAction,
  reopenPeriodAction,
  restoreBackupAction,
  updateSettingsAction,
  validateBackupAction,
} from "@/lib/accounting/actions";
import { formatAmount } from "@/lib/accounting/money";
import type { ClosingPreview } from "@/lib/accounting/setup";
import { Label, useAct, type Option } from "@/components/accounting/kit";
import { Panel, Pill, Table, btn, btnDanger, btnPrimary, input, rowCls, td, tdR, th, thR, totalRow } from "@/components/accounting/ui";

export interface SettingsData {
  businessName: string;
  currencyCode: string;
  currencyLabel: string;
  decimals: number;
  retainedEarningsAccountId: string;
  isDemo: boolean;
}
export interface FiscalYearData {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  periods: Array<{ id: string; name: string; startDate: string; endDate: string; isLocked: boolean }>;
}

export function GeneralSettings({ settings, equityAccounts, hasAmounts }: { settings: SettingsData; equityAccounts: Option[]; hasAmounts: boolean }) {
  const act = useAct();
  const [f, setF] = useState(settings);
  return (
    <Panel title="Business and currency">
      <form
        className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          act.run(() => updateSettingsAction(f), "Settings saved");
        }}
      >
        <Label label="Business name" error={act.err("businessName")} className="lg:col-span-2">
          <input className={input} value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} />
        </Label>
        <Label label="Retained earnings account (year-end closing)" error={act.err("retainedEarningsAccountId")} className="lg:col-span-2">
          <select className={input} value={f.retainedEarningsAccountId} onChange={(e) => setF({ ...f, retainedEarningsAccountId: e.target.value })}>
            {equityAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Label>
        <Label label="Base currency code" error={act.err("currencyCode")}>
          <input className={input} value={f.currencyCode} disabled={hasAmounts} onChange={(e) => setF({ ...f, currencyCode: e.target.value })} />
        </Label>
        <Label label="Display unit" error={act.err("currencyLabel")}>
          <input className={input} value={f.currencyLabel} disabled={hasAmounts} onChange={(e) => setF({ ...f, currencyLabel: e.target.value })} />
        </Label>
        <Label label="Decimal places (0 to 4)" error={act.err("decimals")}>
          <input className={input} type="number" min={0} max={4} value={f.decimals} disabled={hasAmounts} onChange={(e) => setF({ ...f, decimals: Number(e.target.value) })} />
        </Label>
        <div className="flex items-end">
          <button className={btnPrimary} disabled={act.busy}>
            Save settings
          </button>
        </div>
        <p className="text-[12px] text-slate-500 sm:col-span-2 lg:col-span-4">
          All amounts are stored and shown in this one currency and unit, with exactly this precision. There is no conversion: if you
          keep books in rials, enter rials everywhere (not tomans), and the reverse.{" "}
          {hasAmounts
            ? "Currency, unit and precision are locked because amounts have already been recorded."
            : "Choose carefully: these lock once the first amount is recorded."}
        </p>
      </form>
    </Panel>
  );
}

export function FiscalYears({ years, decimals, nextStart }: { years: FiscalYearData[]; decimals: number; nextStart: string }) {
  const act = useAct();
  const [name, setName] = useState(`FY ${nextStart.slice(0, 4)}`);
  const [startDate, setStartDate] = useState(nextStart);
  const [preview, setPreview] = useState<ClosingPreview | null>(null);
  const fmt = (n: number) => formatAmount(n, decimals);

  const reopen = (id: string, label: string, year = false) => {
    const reason = prompt(`Reopening ${label} allows changes to a finished ${year ? "year. Its closing entry will be reversed" : "period"}.\nThis is recorded in the audit log. Reason:`);
    if (reason === null) return;
    act.run(() => (year ? reopenFiscalYearAction(id, reason) : reopenPeriodAction(id, reason)), `${label} reopened`);
  };
  async function showClosing(id: string) {
    const r = await act.run(() => previewClosingAction(id));
    if (r) setPreview(r.data);
  }
  async function close() {
    if (!preview) return;
    if (await act.run(() => closeFiscalYearAction(preview.fiscalYear.id), `${preview.fiscalYear.name} closed`)) setPreview(null);
  }

  return (
    <Panel title="Fiscal years and accounting periods">
      <div className="space-y-4 p-4">
        {years.map((y) => (
          <div key={y.id} className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
              <strong>{y.name}</strong>
              <span className="text-slate-500">
                {y.startDate} to {y.endDate}
              </span>
              {y.isClosed ? <Pill tone="slate">Closed</Pill> : <Pill tone="green">Open</Pill>}
              <span className="ml-auto flex gap-2">
                {y.isClosed ? (
                  <button type="button" className={btn + " h-7 px-2"} disabled={act.busy} onClick={() => reopen(y.id, y.name, true)}>
                    Reopen year…
                  </button>
                ) : (
                  <>
                    <button type="button" className={btn + " h-7 px-2"} disabled={act.busy} onClick={() => showClosing(y.id)}>
                      Year-end closing…
                    </button>
                    <button
                      type="button"
                      className={btnDanger + " h-7 px-2"}
                      disabled={act.busy}
                      onClick={() => confirm(`Delete ${y.name}? Only possible when it has no journal entries.`) && act.run(() => deleteFiscalYearAction(y.id), "Fiscal year deleted")}
                    >
                      Delete
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 p-3">
              {y.periods.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={act.busy}
                  title={`${p.startDate} to ${p.endDate}. Click to ${p.isLocked ? "reopen" : "lock"}.`}
                  aria-label={`${p.name}: ${p.isLocked ? "locked, click to reopen" : "open, click to lock"}`}
                  onClick={() => (p.isLocked ? reopen(p.id, p.name) : act.run(() => lockPeriodAction(p.id), `${p.name} locked`))}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                    p.isLocked ? "border-slate-300 bg-slate-100 text-slate-600" : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {p.isLocked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-[12px] text-slate-500">
          Green periods are open for posting. A locked period accepts no new entries, reversals or changes. Reopening needs a reason and is logged.
        </p>
        <form
          className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            act.run(() => createFiscalYearAction({ name, startDate }), "Fiscal year created");
          }}
        >
          <Label label="New fiscal year name" error={act.err("name")}>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </Label>
          <Label label="Start date (12 monthly periods follow)" error={act.err("startDate")}>
            <input type="date" className={input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Label>
          <button className={btn} disabled={act.busy}>
            Add fiscal year
          </button>
        </form>
      </div>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        size="lg"
        title={preview ? `Year-end closing preview: ${preview.fiscalYear.name}` : ""}
        description="Income and expense accounts are brought to zero and the net result moves to retained earnings. All periods of the year are then locked."
        footer={
          <>
            <button type="button" className={btn} onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={close} disabled={act.busy || !!preview?.blockers.length}>
              {act.busy ? "Closing…" : "Post closing entry and close year"}
            </button>
          </>
        }
      >
        {preview && (
          <div className="space-y-3 text-[13px]">
            {preview.blockers.map((b) => (
              <p key={b} role="alert" className="rounded-lg bg-red-50 px-3 py-2 font-medium text-red-800">
                {b}
              </p>
            ))}
            <p>
              Income {fmt(preview.income)} · Expenses {fmt(preview.expenses)} ·{" "}
              <strong>
                {preview.netResult < 0 ? "Net loss" : "Net profit"} {fmt(Math.abs(preview.netResult))}
              </strong>{" "}
              {preview.retainedEarnings && (
                <>
                  to {preview.retainedEarnings.code} {preview.retainedEarnings.name}
                </>
              )}
            </p>
            {preview.lines.length ? (
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Account</th>
                    <th className={th}>Party</th>
                    <th className={thR}>Debit</th>
                    <th className={thR}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l, i) => (
                    <tr key={i} className={rowCls}>
                      <td className={td}>
                        {l.accountCode} {l.accountName}
                      </td>
                      <td className={td}>{l.partyName}</td>
                      <td className={tdR}>{l.debit ? fmt(l.debit) : ""}</td>
                      <td className={tdR}>{l.credit ? fmt(l.credit) : ""}</td>
                    </tr>
                  ))}
                  <tr className={totalRow}>
                    <td className={td} colSpan={2}>
                      Closing entry dated {preview.fiscalYear.endDate}
                    </td>
                    <td className={tdR}>{fmt(preview.lines.reduce((s, l) => s + l.debit, 0))}</td>
                    <td className={tdR}>{fmt(preview.lines.reduce((s, l) => s + l.credit, 0))}</td>
                  </tr>
                </tbody>
              </Table>
            ) : (
              <p className="text-slate-600">There are no income or expense balances to close; the year will simply be locked.</p>
            )}
          </div>
        )}
      </Modal>
    </Panel>
  );
}

export function BackupAndDemo({ isDemo }: { isDemo: boolean }) {
  const act = useAct();
  const fileRef = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState<{ file: File; summary: Record<string, string | number> } | null>(null);

  async function validate(file: File | undefined) {
    setChecked(null);
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const r = await act.run(() => validateBackupAction(form));
    if (r) setChecked({ file, summary: r.data });
    else if (fileRef.current) fileRef.current.value = "";
  }
  async function restore() {
    if (!checked) return;
    if (!confirm("Replace ALL current accounting data with this backup? This cannot be undone. Download a backup of the current data first if you might need it.")) return;
    const form = new FormData();
    form.set("file", checked.file);
    if (await act.run(() => restoreBackupAction(form), "Backup restored")) {
      setChecked(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Backup and restore">
        <div className="space-y-3 p-4 text-[13px]">
          <p className="text-slate-600">
            A backup is one file with every accounting record: accounts, parties, entries, attachments, statements, reconciliations and
            the audit log.
          </p>
          <a href="/api/accounting/backup" className={btnPrimary}>
            Download backup
          </a>
          <div className="border-t border-slate-200 pt-3">
            <label className="block text-[12px] font-medium text-slate-600">
              Restore from a backup file
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                disabled={act.busy}
                onChange={(e) => validate(e.target.files?.[0])}
                className="mt-1 block text-[13px] file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
              />
            </label>
            <p className="mt-1 text-[12px] text-slate-500">The file is checked completely before anything is replaced.</p>
            {checked && (
              <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
                <p className="font-medium">Backup is valid.</p>
                <p>
                  Created {String(checked.summary.createdAt).slice(0, 16).replace("T", " ")} · {checked.summary.entries} entries ·{" "}
                  {checked.summary.accounts} accounts · {checked.summary.parties} parties · {checked.summary.attachments} attachments ·{" "}
                  {checked.summary.statementLines} statement lines
                </p>
                <button type="button" className={btnDanger + " mt-2"} onClick={restore} disabled={act.busy}>
                  {act.busy ? "Restoring…" : "Replace current data with this backup"}
                </button>
              </div>
            )}
          </div>
        </div>
      </Panel>
      <Panel title="Demo dataset">
        <div className="space-y-3 p-4 text-[13px]">
          <p className="text-slate-600">
            A small fictional dataset (January 2026) showing opening balances, a receivable and a payable with partial settlements, an
            expense, a transfer, and a bank statement with a fee, an uncashed cheque and two same-amount transactions to match.
          </p>
          {isDemo ? (
            <>
              <p className="font-medium text-amber-800">The books currently hold demo data.</p>
              <button
                type="button"
                className={btnDanger}
                disabled={act.busy}
                onClick={() => confirm("Remove all demo data and return to empty books with the starter chart of accounts?") && act.run(() => clearDemoAction(), "Demo data removed")}
              >
                {act.busy ? "Working…" : "Clear demo data"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={btn} disabled={act.busy} onClick={() => act.run(() => loadDemoAction(), "Demo data loaded")}>
                {act.busy ? "Loading…" : "Load demo data"}
              </button>
              <p className="text-[12px] text-slate-500">
                Only possible while the books are empty, so demo records can never mix with real ones. A banner marks demo books on every screen.
              </p>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
