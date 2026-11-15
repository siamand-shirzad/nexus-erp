"use client";

import { useState } from "react";
import Link from "next/link";
import { commitImportAction, previewImportAction, readStatementAction } from "@/lib/accounting/actions";
import { formatAmount, parseAmount } from "@/lib/accounting/money";
import type { StatementMapping } from "@/lib/accounting/statement";
import { AmountInput, Label, useAct } from "@/components/accounting/kit";
import { Panel, Pill, Table, btn, btnPrimary, input, linkCls, rowCls, td, tdR, th, thR } from "@/components/accounting/ui";

type FileInfo = { headers: string[]; sample: string[][]; rowCount: number };
type Preview = Extract<Awaited<ReturnType<typeof previewImportAction>>, { ok: true }>["data"];
type Done = { imported: number; skipped: number; flagged: number };

const NONE = "";

export function ImportWizard({ bankAccountId, bankName, decimals, currency }: { bankAccountId: string; bankName: string; decimals: number; currency: string }) {
  const act = useAct();
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // nothing is preselected for the date format or the sign convention: the user must state them
  const [m, setM] = useState({
    date: NONE, description: NONE, reference: NONE, externalId: NONE, balance: NONE,
    dateFormat: NONE, amountMode: "split", amount: NONE, positiveMeans: NONE, deposit: NONE, withdrawal: NONE,
  });
  const [opening, setOpening] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [closing, setClosing] = useState("");
  const [localError, setLocalError] = useState("");
  const fmt = (n: number) => formatAmount(n, decimals);

  const update = (patch: Partial<typeof m>) => {
    setM((cur) => ({ ...cur, ...patch }));
    setPreview(null); // any mapping change needs a fresh check
  };
  const col = (v: string) => (v === NONE ? null : Number(v));
  const mapping = (): StatementMapping => ({
    date: col(m.date) ?? -1,
    description: col(m.description),
    reference: col(m.reference),
    externalId: col(m.externalId),
    balance: col(m.balance),
    dateFormat: m.dateFormat as StatementMapping["dateFormat"],
    amountMode: m.amountMode as StatementMapping["amountMode"],
    amount: col(m.amount),
    positiveMeans: (m.positiveMeans || undefined) as StatementMapping["positiveMeans"],
    deposit: col(m.deposit),
    withdrawal: col(m.withdrawal),
  });
  const form = () => {
    const f = new FormData();
    f.set("file", file!);
    f.set("bankAccountId", bankAccountId);
    f.set("mapping", JSON.stringify(mapping()));
    return f;
  };

  async function choose(f: File | undefined) {
    setInfo(null);
    setPreview(null);
    setDone(null);
    setFile(f ?? null);
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    const r = await act.run(() => readStatementAction(fd));
    if (r) setInfo(r.data);
  }
  async function check() {
    const r = await act.run(() => previewImportAction(form()));
    if (r) setPreview(r.data);
  }
  async function commit() {
    setLocalError("");
    const amounts: Record<string, number | null> = {};
    for (const [key, text] of [["openingBalance", opening], ["closingBalance", closing]] as const) {
      if (!text.trim()) continue;
      const v = parseAmount(text, decimals);
      if (v === null) return setLocalError("The opening and closing balances must be valid amounts.");
      amounts[key] = v;
    }
    const f = form();
    f.set("extras", JSON.stringify({ ...amounts, openingDate: openingDate || null }));
    const r = await act.run(() => commitImportAction(f), "Statement imported");
    if (r) setDone(r.data);
  }

  const columns = (label: string, key: keyof typeof m, optional = false) => (
    <Label label={label} error={act.err(key)}>
      <select className={input} value={m[key]} onChange={(e) => update({ [key]: e.target.value })}>
        <option value={NONE}>{optional ? "Not in file" : "Choose column…"}</option>
        {info!.headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </Label>
  );

  if (done)
    return (
      <Panel title="Import complete">
        <div className="space-y-2 p-4 text-[13px]">
          <p>
            <strong>{done.imported}</strong> statement line(s) imported into {bankName}.
            {done.skipped > 0 && <> {done.skipped} already-imported transaction(s) were skipped.</>}
            {done.flagged > 0 && <> {done.flagged} likely duplicate(s) were flagged for review on the account page.</>}
          </p>
          <p className="text-slate-600">No journal entries were created. Match the lines against your books in Reconciliation.</p>
          <p className="flex gap-3 pt-2">
            <Link href={`/accounting/reconciliation?bank=${bankAccountId}`} className={btnPrimary}>
              Go to reconciliation
            </Link>
            <Link href={`/accounting/bank/${bankAccountId}`} className={btn}>
              Back to account
            </Link>
          </p>
        </div>
      </Panel>
    );

  return (
    <div className="space-y-4">
      <Panel title="1. Choose a CSV or XLSX file">
        <div className="p-4">
          <input
            type="file"
            accept=".csv,.xlsx"
            aria-label="Statement file"
            onChange={(e) => choose(e.target.files?.[0])}
            className="block text-[13px] file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
          />
          <p className="mt-2 text-[12px] text-slate-500">The first row must contain column headings. Sample files are in the project&apos;s samples folder.</p>
          {act.busy && !info && <p className="mt-2 text-[13px] text-slate-600">Reading file…</p>}
        </div>
        {info && (
          <div className="border-t border-slate-200">
            <p className="px-4 pt-3 text-[12px] font-medium text-slate-600">
              File preview: first {info.sample.length} of {info.rowCount} row(s), exactly as read
            </p>
            <Table>
              <thead>
                <tr>
                  {info.headers.map((h, i) => (
                    <th key={i} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {info.sample.map((r, i) => (
                  <tr key={i} className={rowCls}>
                    {r.map((c, j) => (
                      <td key={j} className={td}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Panel>

      {info && (
        <Panel title="2. Tell us what the columns mean">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {columns("Date column", "date")}
            <Label label="Date format" error={act.err("dateFormat")}>
              <select className={input} value={m.dateFormat} onChange={(e) => update({ dateFormat: e.target.value })}>
                <option value={NONE}>Choose format…</option>
                <option value="YMD">Year-Month-Day (2026-01-31)</option>
                <option value="DMY">Day/Month/Year (31/01/2026)</option>
                <option value="MDY">Month/Day/Year (01/31/2026)</option>
              </select>
            </Label>
            {columns("Description column", "description", true)}
            {columns("Reference column", "reference", true)}
            {columns("Bank transaction id column", "externalId", true)}
            {columns("Running balance column", "balance", true)}
            <Label label="Amount layout" className="lg:col-span-2">
              <select className={input} value={m.amountMode} onChange={(e) => update({ amountMode: e.target.value })}>
                <option value="split">Separate withdrawal and deposit columns</option>
                <option value="signed">One signed amount column</option>
              </select>
            </Label>
            {m.amountMode === "split" ? (
              <>
                {columns("Deposit column (money in)", "deposit")}
                {columns("Withdrawal column (money out)", "withdrawal")}
              </>
            ) : (
              <>
                {columns("Amount column", "amount")}
                <Label label="A positive amount means" error={act.err("positiveMeans")}>
                  <select className={input} value={m.positiveMeans} onChange={(e) => update({ positiveMeans: e.target.value })}>
                    <option value={NONE}>Choose…</option>
                    <option value="deposit">Deposit (money into the account)</option>
                    <option value="withdrawal">Withdrawal (money out of the account)</option>
                  </select>
                </Label>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-3">
            <button type="button" className={btnPrimary} onClick={check} disabled={act.busy}>
              {act.busy ? "Checking…" : "Check file"}
            </button>
            <span className="text-[12px] text-slate-500">Nothing is saved at this step.</span>
          </div>
        </Panel>
      )}

      {preview && (
        <Panel title="3. Review and import">
          <div className="space-y-3 p-4 text-[13px]">
            {preview.fileAlreadyImported && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 font-medium text-red-800">
                This exact file was already imported for this account on {preview.fileAlreadyImported.slice(0, 10)}. It cannot be imported again.
              </p>
            )}
            {preview.errors.length > 0 && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
                <p className="font-medium">
                  {preview.errors.length} row(s) cannot be read. Nothing will be imported until the file or the mapping is corrected.
                </p>
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.rowNo}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p>
              <strong>{preview.rows.length}</strong> transaction(s) ready to import
              {preview.fromDate && <>, dated {preview.fromDate} to {preview.toDate}</>}, net movement{" "}
              <strong className="tnum">{fmt(preview.total)}</strong> {currency}.
              {preview.blank > 0 && <> {preview.blank} completely empty row(s) ignored.</>}
            </p>
            {preview.alreadyImported.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                {preview.alreadyImported.length} row(s) carry a bank transaction id that is already stored and will be skipped: rows{" "}
                {preview.alreadyImported.map((r) => r.rowNo).join(", ")}.
              </p>
            )}
            {preview.rows.some((r) => r.likelyDuplicate) && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                {preview.rows.filter((r) => r.likelyDuplicate).length} row(s) look like transactions from an earlier import (same date,
                amount and description, no transaction id). They will be imported and flagged for your review, not discarded.
              </p>
            )}
          </div>
          {preview.rows.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <th className={th}>Row</th>
                  <th className={th}>Date</th>
                  <th className={th}>Description</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Transaction id</th>
                  <th className={thR}>Deposit</th>
                  <th className={thR}>Withdrawal</th>
                  <th className={thR}>Balance</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r) => (
                  <tr key={r.rowNo} className={rowCls}>
                    <td className={td}>{r.rowNo}</td>
                    <td className={td}>{r.date}</td>
                    <td className={td}>{r.description}</td>
                    <td className={td}>{r.reference}</td>
                    <td className={td}>{r.externalId}</td>
                    <td className={tdR}>{r.amount > 0 ? fmt(r.amount) : ""}</td>
                    <td className={tdR}>{r.amount < 0 ? fmt(-r.amount) : ""}</td>
                    <td className={tdR}>{r.runningBalance == null ? "" : fmt(r.runningBalance)}</td>
                    <td className={td}>{r.likelyDuplicate && <Pill tone="amber">Likely duplicate</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {preview.rows.length > 100 && <p className="px-4 py-2 text-[12px] text-slate-500">Showing the first 100 rows.</p>}

          <div className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-3">
            <Label label="Statement opening balance (optional)" error={act.err("openingBalance")}>
              <AmountInput value={opening} onChange={setOpening} placeholder="If not in the file" />
            </Label>
            <Label label="Opening balance date" error={act.err("openingDate")}>
              <input type="date" className={input} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
            </Label>
            <Label label="Statement closing balance (optional)">
              <AmountInput value={closing} onChange={setClosing} placeholder="If not in the file" />
            </Label>
            <p className="text-[12px] text-slate-500 sm:col-span-3">
              Record the opening balance the first time you import for this account, so the statement is not assumed to cover the
              account&apos;s whole history. It becomes a statement line that you match to your opening entry.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              className={btnPrimary}
              onClick={commit}
              disabled={act.busy || !!preview.fileAlreadyImported || preview.errors.length > 0 || preview.rows.length === 0}
            >
              {act.busy ? "Importing…" : `Import ${preview.rows.length} line(s)`}
            </button>
            {localError && <span role="alert" className="text-[12px] font-medium text-red-700">{localError}</span>}
            <Link href={`/accounting/bank/${bankAccountId}`} className={linkCls}>
              Cancel
            </Link>
          </div>
        </Panel>
      )}
    </div>
  );
}
