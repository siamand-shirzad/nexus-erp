import Link from "next/link";
import type { LedgerResult } from "@/lib/accounting/reports";
import { drCr, formatAmount, toMajor } from "@/lib/accounting/money";
import { Balance, Empty, Money, Table, linkCls, td, tdR, th, thR, totalRow } from "./ui";

interface Props {
  l: LedgerResult;
  decimals: number;
  from?: string;
  showAccount?: boolean;
  showParty?: boolean;
}

/**
 * Ledger rows with opening balance, running balance, period totals and closing balance.
 * The whole row opens the source journal entry (the entry link is stretched over the row).
 */
export function LedgerTable({ l, decimals, from, showAccount, showParty = true }: Props) {
  const span = 3 + (showAccount ? 1 : 0) + (showParty ? 1 : 0);
  if (!l.rows.length && !l.opening) return <Empty>No posted transactions in this range.</Empty>;
  return (
    <Table>
      <thead>
        <tr>
          <th className={th}>Date</th>
          <th className={th}>Entry</th>
          <th className={th}>Description</th>
          {showAccount && <th className={th}>Account</th>}
          {showParty && <th className={th}>Party</th>}
          <th className={thR}>Debit</th>
          <th className={thR}>Credit</th>
          <th className={thR}>Balance</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-slate-100 bg-slate-50/70 font-medium">
          <td className={td} colSpan={span}>
            Opening balance{from ? ` (before ${from})` : ""}
          </td>
          <td className={tdR} />
          <td className={tdR} />
          <td className={tdR}>
            <Balance value={l.opening} decimals={decimals} />
          </td>
        </tr>
        {l.rows.map((r) => (
          <tr key={r.lineId} className="relative border-t border-slate-100 hover:bg-indigo-50/60">
            <td className={td + " whitespace-nowrap"}>{r.date}</td>
            <td className={td + " whitespace-nowrap"}>
              <Link href={`/accounting/journal/${r.entryId}`} className={linkCls + " after:absolute after:inset-0"}>
                {r.entryNumber}
              </Link>
            </td>
            <td className={td}>{r.description}</td>
            {showAccount && (
              <td className={td}>
                {r.accountCode} {r.accountName}
              </td>
            )}
            {showParty && (
              <td className={td}>
                {r.partyId && (
                  <Link href={`/accounting/parties/${r.partyId}`} className={linkCls + " relative z-10"}>
                    {r.partyName}
                  </Link>
                )}
              </td>
            )}
            <td className={tdR}>
              <Money value={r.debit} decimals={decimals} />
            </td>
            <td className={tdR}>
              <Money value={r.credit} decimals={decimals} />
            </td>
            <td className={tdR}>
              <Balance value={r.balance} decimals={decimals} />
            </td>
          </tr>
        ))}
        <tr className={totalRow}>
          <td className={td} colSpan={span}>
            Period totals{l.filtered ? " (filtered rows)" : ""}
          </td>
          <td className={tdR}>{formatAmount(l.totalDebit, decimals)}</td>
          <td className={tdR}>{formatAmount(l.totalCredit, decimals)}</td>
          <td className={tdR} />
        </tr>
        <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
          <td className={td} colSpan={span + 2}>
            Closing balance
          </td>
          <td className={tdR}>
            <Balance value={l.closing} decimals={decimals} />
          </td>
        </tr>
      </tbody>
    </Table>
  );
}

/** The same ledger as spreadsheet rows. Balance is debit-positive; the label column says Dr or Cr. */
export function ledgerExport(l: LedgerResult, decimals: number) {
  const side = (b: number) => (b === 0 ? "" : b > 0 ? "Dr" : "Cr");
  const m = (n: number) => toMajor(n, decimals);
  return {
    columns: ["Date", "Entry", "Description", "Account", "Party", "Debit", "Credit", "Balance", "Dr/Cr"],
    rows: [
      ["", "", "Opening balance", "", "", null, null, m(Math.abs(l.opening)), side(l.opening)],
      ...l.rows.map((r) => [
        r.date,
        r.entryNumber,
        r.description,
        `${r.accountCode} ${r.accountName}`,
        r.partyName ?? "",
        r.debit ? m(r.debit) : null,
        r.credit ? m(r.credit) : null,
        m(Math.abs(r.balance)),
        side(r.balance),
      ]),
      ["", "", "Period totals", "", "", m(l.totalDebit), m(l.totalCredit), null, ""],
      ["", "", "Closing balance", "", "", null, null, m(Math.abs(l.closing)), side(l.closing)],
    ] as Array<Array<string | number | null>>,
    closingText: drCr(l.closing, decimals),
  };
}
