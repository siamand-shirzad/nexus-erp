import type { ReconSnapshot } from "@/lib/accounting/recon";
import { formatAmount } from "@/lib/accounting/money";
import { EntryLink, Table, rowCls, td, tdR, th, thR } from "./ui";

type Data = Pick<ReconSnapshot, "report" | "outstandingBook" | "unrecordedStatement" | "adjustments">;

/** The bank reconciliation statement: both balances at the cutoff, the items explaining the gap, and what is left. */
export function ReconReport({ data, decimals }: { data: Data; decimals: number }) {
  const r = data.report;
  const fmt = (n: number | null) => (n == null ? "not entered" : formatAmount(n, decimals));
  const line = (label: string, value: number | null, strong = false) => (
    <tr className={strong ? "border-t border-slate-300 font-semibold text-slate-900" : ""}>
      <td className="px-4 py-1.5">{label}</td>
      <td className="px-4 py-1.5 text-right tnum">{fmt(value)}</td>
    </tr>
  );
  const gap = r.statementClosingBalance == null ? 0 : r.statementClosingBalance - r.importedStatementTotal;

  return (
    <div>
      <div className="grid gap-x-8 lg:grid-cols-2">
        <table className="w-full text-[13px]">
          <tbody>
            {line(`Statement closing balance at ${r.cutoff}`, r.statementClosingBalance)}
            {line("Add: book items not yet on the statement (outstanding)", r.outstandingBookTotal)}
            {line("Adjusted statement balance", r.adjustedStatementBalance, true)}
          </tbody>
        </table>
        <table className="w-full text-[13px]">
          <tbody>
            {line(`Book balance at ${r.cutoff}`, r.bookBalance)}
            {line("Add: statement items not yet in the books", r.unrecordedStatementTotal)}
            {line("Adjusted book balance", r.adjustedBookBalance, true)}
          </tbody>
        </table>
      </div>
      <div
        className={`mx-4 my-3 rounded-lg px-3 py-2 text-[13px] font-semibold ${
          r.difference === 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
        }`}
      >
        Remaining difference: {r.difference == null ? "enter the statement closing balance" : formatAmount(r.difference, decimals)}
        {r.difference === 0 && " (balances agree)"}
      </div>
      {r.statementClosingBalance != null && gap !== 0 && (
        <p className="mx-4 mb-3 text-[12px] text-red-800">
          The imported statement lines up to the cutoff add up to {formatAmount(r.importedStatementTotal, decimals)}, which is{" "}
          {formatAmount(Math.abs(gap), decimals)} {gap > 0 ? "less" : "more"} than the closing balance. Either the closing balance is
          mistyped or statement history is missing
          {r.hasOpeningBalance ? " (import the missing statements)" : " (record the statement opening balance when importing)"}.
        </p>
      )}
      <p className="mx-4 mb-3 text-[12px] text-slate-500">
        Adjusting entries posted for statement-only items in this period (already part of the book balance):{" "}
        {formatAmount(r.adjustmentsTotal, decimals)}. Amounts are signed: money in is positive, money out is negative.
      </p>

      <ItemList title="Outstanding book items (in the books, not yet on the statement)" empty="None.">
        {data.outstandingBook.map((b) => (
          <tr key={b.id} className={rowCls}>
            <td className={td}>{b.date}</td>
            <td className={td}>
              <EntryLink id={b.entryId}>{b.entryNumber}</EntryLink>
            </td>
            <td className={td}>{b.description}</td>
            <td className={td}>{b.reference}</td>
            <td className={tdR}>{formatAmount(b.amount, decimals)}</td>
          </tr>
        ))}
      </ItemList>
      <ItemList title="Statement items not yet in the books" empty="None.">
        {data.unrecordedStatement.map((s) => (
          <tr key={s.id} className={rowCls}>
            <td className={td}>{s.date}</td>
            <td className={td} />
            <td className={td}>{s.description}</td>
            <td className={td}>{s.reference}</td>
            <td className={tdR}>{formatAmount(s.amount, decimals)}</td>
          </tr>
        ))}
      </ItemList>
      <ItemList title="Adjusting entries" empty="None.">
        {data.adjustments.map((a) => (
          <tr key={a.entryId} className={rowCls}>
            <td className={td}>{a.date}</td>
            <td className={td}>
              <EntryLink id={a.entryId}>{a.entryNumber}</EntryLink>
            </td>
            <td className={td}>{a.description}</td>
            <td className={td} />
            <td className={tdR}>{formatAmount(a.amount, decimals)}</td>
          </tr>
        ))}
      </ItemList>
    </div>
  );
}

function ItemList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="border-t border-slate-200">
      <h3 className="px-4 pt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children.length ? (
        <Table>
          <thead>
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Entry</th>
              <th className={th}>Description</th>
              <th className={th}>Reference</th>
              <th className={thR}>Amount</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </Table>
      ) : (
        <p className="px-4 pb-3 pt-1 text-[13px] text-slate-500">{empty}</p>
      )}
    </div>
  );
}
