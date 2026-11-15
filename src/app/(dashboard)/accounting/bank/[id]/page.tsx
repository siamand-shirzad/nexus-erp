import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listBankAccounts } from "@/lib/accounting/masterdata";
import { cashMovements, ledger } from "@/lib/accounting/reports";
import { listImports, listReconciliations, listStatementLines } from "@/lib/accounting/recon";
import { getSettings } from "@/lib/accounting/setup";
import { formatAmount } from "@/lib/accounting/money";
import { rangeFrom, type Params } from "@/lib/accounting/range";
import { LedgerTable } from "@/components/accounting/LedgerTable";
import {
  Balance,
  Empty,
  F,
  PageTitle,
  Panel,
  Pill,
  Stat,
  Table,
  btn,
  btnPrimary,
  input,
  linkCls,
  rowCls,
  stamp,
  td,
  tdR,
  th,
  thR,
} from "@/components/accounting/ui";
import { DeleteImportButton, DuplicateReview } from "../BankViews";

export default async function BankDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Params }) {
  await requireBooksAccess();
  const { id } = await params;
  const bank = (await listBankAccounts()).find((b) => b.id === id);
  if (!bank) notFound();
  const { from, to } = await rangeFrom(await searchParams);
  const isBank = bank.kind === "bank";
  const [l, period, now, s, imports, lines, recs] = await Promise.all([
    ledger({ accountId: bank.accountId, from, to }),
    cashMovements({ from, to }),
    cashMovements({}),
    getSettings(),
    isBank ? listImports(id) : [],
    isBank ? listStatementLines(id) : [],
    isBank ? listReconciliations(id) : [],
  ]);
  const p = period.rows.find((r) => r.bankAccountId === id)!;
  const fmt = (n: number) => formatAmount(n, s.decimals);
  const flagged = lines.filter((x) => x.duplicateFlag);

  return (
    <>
      <PageTitle
        title={bank.name}
        description={`${isBank ? "Bank account" : "Cash account"} · ledger ${bank.accountCode} ${bank.accountName}${bank.bankName ? ` · ${bank.bankName}` : ""}${bank.accountNumber ? ` · ${bank.accountNumber}` : ""}`}
        actions={
          <>
            <Link href="/accounting/bank" className={btn}>
              All accounts
            </Link>
            {isBank && (
              <>
                <Link href={`/accounting/bank/${id}/import`} className={btn}>
                  Import statement
                </Link>
                <Link href={`/accounting/reconciliation?bank=${id}`} className={btnPrimary}>
                  Reconcile
                </Link>
              </>
            )}
          </>
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <F label="From">
          <input type="date" name="from" defaultValue={from} className={input} />
        </F>
        <F label="To">
          <input type="date" name="to" defaultValue={to} className={input} />
        </F>
        <button className={btn}>Apply</button>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Ledger balance today" value={<Balance value={now.rows.find((r) => r.bankAccountId === id)!.closing} decimals={s.decimals} />} />
        <Stat label="Receipts" value={fmt(p.receipts)} hint="In the selected period" />
        <Stat label="Payments" value={fmt(p.payments)} hint="In the selected period" />
        <Stat label="Transfers in" value={fmt(p.transfersIn)} hint="From your own accounts" />
        <Stat label="Transfers out" value={fmt(p.transfersOut)} hint="To your own accounts" />
      </div>

      <Panel title={`Ledger transactions, ${from} to ${to}`}>
        <LedgerTable l={l} decimals={s.decimals} from={from} />
      </Panel>

      {isBank && (
        <>
          {flagged.length > 0 && (
            <Panel title="Likely duplicate statement lines to review" className="mt-4">
              <p className="px-4 pt-3 text-[12px] text-slate-600">
                These lines match the date, amount and description of lines from another import and carry no
                bank transaction id. They may be genuine repeats. Keep or remove each one.
              </p>
              <Table>
                <tbody>
                  {flagged.map((x) => (
                    <tr key={x.id} className={rowCls}>
                      <td className={td}>{x.date}</td>
                      <td className={td}>{x.description}</td>
                      <td className={tdR}>{fmt(x.amount)}</td>
                      <td className={td}>
                        <DuplicateReview id={x.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          )}

          <Panel title="Statement imports" className="mt-4">
            {imports.length ? (
              <Table>
                <thead>
                  <tr>
                    <th className={th}>File</th>
                    <th className={th}>Imported</th>
                    <th className={th}>Covers</th>
                    <th className={thR}>Lines</th>
                    <th className={thR}>Opening balance</th>
                    <th className={thR}>Closing balance</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {imports.map((i) => (
                    <tr key={i.id} className={rowCls}>
                      <td className={td}>{i.filename}</td>
                      <td className={td}>{stamp(i.importedAt).slice(0, 16)}</td>
                      <td className={td}>
                        {i.fromDate} to {i.toDate}
                      </td>
                      <td className={tdR}>{i.rowCount}</td>
                      <td className={tdR}>{i.openingBalance == null ? "—" : fmt(i.openingBalance)}</td>
                      <td className={tdR}>{i.closingBalance == null ? "—" : fmt(i.closingBalance)}</td>
                      <td className={td + " text-right"}>
                        <DeleteImportButton id={i.id} filename={i.filename} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>No statements imported yet. Importing never creates journal entries.</Empty>
            )}
          </Panel>

          <Panel title="Statement lines" className="mt-4">
            {lines.length ? (
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Description</th>
                    <th className={th}>Reference</th>
                    <th className={thR}>Deposit</th>
                    <th className={thR}>Withdrawal</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.slice(0, 200).map((x) => (
                    <tr key={x.id} className={rowCls}>
                      <td className={td}>{x.date}</td>
                      <td className={td}>{x.description}</td>
                      <td className={td}>{x.reference}</td>
                      <td className={tdR}>{x.amount > 0 ? fmt(x.amount) : ""}</td>
                      <td className={tdR}>{x.amount < 0 ? fmt(-x.amount) : ""}</td>
                      <td className={td}>{x.matchId ? <Pill tone="green">Matched</Pill> : <Pill tone="amber">Unmatched</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>No statement lines.</Empty>
            )}
          </Panel>

          <Panel title="Reconciliation history" className="mt-4">
            {recs.length ? (
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Cutoff date</th>
                    <th className={th}>Completed</th>
                    <th className={thR}>Statement balance</th>
                    <th className={thR}>Book balance</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r) => (
                    <tr key={r.id} className={rowCls}>
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
      )}
    </>
  );
}
