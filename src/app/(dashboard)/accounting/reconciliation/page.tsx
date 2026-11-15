import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { isIsoDate, todayIso } from "@/lib/accounting/core";
import { listBankAccounts } from "@/lib/accounting/masterdata";
import { formOptions } from "@/lib/accounting/options";
import { listReconciliations, reconWorkspace } from "@/lib/accounting/recon";
import { getSettings } from "@/lib/accounting/setup";
import { amountToInput, formatAmount, parseAmount } from "@/lib/accounting/money";
import { one, type Params } from "@/lib/accounting/range";
import { ExportButtons } from "@/components/accounting/kit";
import { ReconReport } from "@/components/accounting/ReconReport";
import { Empty, F, PageTitle, Panel, Pill, Table, btn, btnPrimary, input, linkCls, rowCls, td, tdR, th, thR, stamp } from "@/components/accounting/ui";
import { ReconClient } from "./ReconClient";

export default async function ReconciliationPage({ searchParams }: { searchParams: Params }) {
  await requireBooksAccess();
  const p = await searchParams;
  const [allBanks, s, history] = await Promise.all([listBankAccounts(), getSettings(), listReconciliations()]);
  const banks = allBanks.filter((b) => b.kind === "bank");
  const bank = banks.find((b) => b.id === one(p.bank));
  const cutoff = isIsoDate(one(p.cutoff)) ? one(p.cutoff) : "";
  const closingText = one(p.closing);
  const closing = closingText.trim() ? parseAmount(closingText, s.decimals) : null;
  const closingInvalid = closingText.trim() !== "" && closing === null;
  const fmt = (n: number) => formatAmount(n, s.decimals);

  const ws = bank && cutoff ? await reconWorkspace(bank.id, cutoff, closing) : null;
  const options = ws ? await formOptions() : null;

  return (
    <>
      <PageTitle
        title="Bank Reconciliation"
        description="Compare imported statement lines with the posted ledger lines of a bank account, up to a cutoff date."
        actions={
          ws && (
            <ExportButtons
              title={`Bank reconciliation ${bank!.name} ${cutoff}`}
              meta={[s.businessName, `Cutoff: ${cutoff}`, `Currency: ${s.currencyCode} (${s.currencyLabel})`]}
              columns={["Section", "Date", "Entry", "Description", "Reference", "Amount"]}
              rows={[
                ["Statement closing balance", cutoff, "", "", "", ws.report.statementClosingBalance],
                ["Book balance", cutoff, "", "", "", ws.report.bookBalance],
                ...ws.outstandingBook.map((b) => ["Outstanding book item", b.date, b.entryNumber, b.description, b.reference ?? "", b.amount]),
                ...ws.unrecordedStatement.map((x) => ["Statement item not in books", x.date, "", x.description, x.reference ?? "", x.amount]),
                ...ws.adjustments.map((a) => ["Adjusting entry", a.date, a.entryNumber, a.description, "", a.amount]),
                ["Adjusted statement balance", "", "", "", "", ws.report.adjustedStatementBalance],
                ["Adjusted book balance", "", "", "", "", ws.report.adjustedBookBalance],
                ["Remaining difference", "", "", "", "", ws.report.difference],
              ].map((r) => r.map((c) => (typeof c === "number" ? Number(amountToInput(c, s.decimals)) : c)))}
            />
          )
        }
      />

      <form method="get" className="mb-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
        <F label="Bank account">
          <select name="bank" defaultValue={bank?.id ?? ""} className={input} required>
            <option value="">Choose…</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.accountCode})
              </option>
            ))}
          </select>
        </F>
        <F label="Cutoff date (statement date)">
          <input type="date" name="cutoff" defaultValue={cutoff || todayIso()} className={input} required />
        </F>
        <F label={`Statement closing balance (${s.currencyCode})`}>
          <input
            name="closing"
            defaultValue={closingText}
            inputMode="decimal"
            className={input + " text-right tnum"}
            placeholder="From the statement"
            aria-invalid={closingInvalid}
          />
        </F>
        <button className={btnPrimary}>Open</button>
        {ws?.report.suggestedClosing != null && ws.report.suggestedClosing !== closing && (
          <Link
            href={`/accounting/reconciliation?bank=${bank!.id}&cutoff=${cutoff}&closing=${amountToInput(ws.report.suggestedClosing, s.decimals)}`}
            className={btn}
            title="Taken from the imported statement's running balance"
          >
            Use {fmt(ws.report.suggestedClosing)} from the import
          </Link>
        )}
      </form>
      {closingInvalid && <p className="mb-3 text-[13px] font-medium text-red-700">The closing balance is not a valid amount.</p>}

      {ws && bank ? (
        <>
          <Panel title={`Reconciliation report: ${bank.name} at ${cutoff}`} className="mb-4">
            <ReconReport data={ws} decimals={s.decimals} />
          </Panel>
          <ReconClient
            key={`${bank.id}-${cutoff}`}
            bankAccountId={bank.id}
            cutoff={cutoff}
            closingBalance={closing}
            ws={{
              confirmed: ws.confirmed,
              suggestions: ws.suggestions,
              unrecordedStatement: ws.unrecordedStatement,
              outstandingBook: ws.outstandingBook,
              report: ws.report,
            }}
            decimals={s.decimals}
            accounts={options!.accounts.filter((a) => a.id !== bank.accountId)}
            parties={options!.parties}
          />
        </>
      ) : (
        <Panel className="mb-4">
          <Empty>
            {banks.length
              ? "Choose a bank account and the statement date to start. Import the statement first from Bank & Cash."
              : "Add a bank account in Bank & Cash first."}
          </Empty>
        </Panel>
      )}

      <Panel title="Reconciliation history" className="mt-4 print:hidden">
        {history.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Bank account</th>
                <th className={th}>Cutoff date</th>
                <th className={th}>Completed</th>
                <th className={thR}>Statement balance</th>
                <th className={thR}>Book balance</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className={rowCls}>
                  <td className={td}>{r.bankName}</td>
                  <td className={td}>
                    <Link href={`/accounting/reconciliation/${r.id}`} className={linkCls}>
                      {r.cutoffDate}
                    </Link>
                  </td>
                  <td className={td}>{stamp(r.completedAt).slice(0, 10)}</td>
                  <td className={tdR}>{fmt(r.statementClosingBalance)}</td>
                  <td className={tdR}>{fmt(r.bookBalance)}</td>
                  <td className={td}>{r.status === "completed" ? <Pill tone="green">Completed</Pill> : <Pill tone="red">Voided</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>No completed reconciliations yet.</Empty>
        )}
      </Panel>
    </>
  );
}
