import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { PageTitle } from "@/components/accounting/ui";

const REPORTS: Array<[string, string, string]> = [
  ["ledger", "Account ledger", "One account over a date range: opening balance, every transaction, running and closing balance."],
  ["general-ledger", "General ledger", "The ledger of every account with activity in the period."],
  ["journal", "General journal", "All posted entries in date order with their debit and credit lines."],
  ["trial-balance", "Trial balance", "Debit and credit balances of all accounts; proves the books balance."],
  ["income-statement", "Income statement", "Income, expenses and the net result for a period."],
  ["balance-sheet", "Balance sheet", "Assets, liabilities and equity at a date, including current earnings."],
  ["parties", "Receivables and payables by party", "What each party owes the business and what the business owes them."],
  ["cash-movements", "Bank and cash movements", "Receipts, payments and internal transfers per bank and cash account."],
];

export default async function ReportsIndex() {
  await requireBooksAccess();
  return (
    <>
      <PageTitle
        title="Reports"
        description="All reports read posted entries only and use the same inclusive date boundaries. Figures link to the ledger lines and entries behind them."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(([slug, title, text]) => (
          <Link
            key={slug}
            href={`/accounting/reports/${slug}`}
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-[13px] text-slate-500">{text}</p>
          </Link>
        ))}
        <Link
          href="/accounting/reconciliation"
          className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
        >
          <h2 className="text-sm font-semibold text-slate-900">Bank reconciliation report</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Statement balance against book balance at a cutoff date, with outstanding and unrecorded items. Completed reports are kept in the history.
          </p>
        </Link>
      </div>
    </>
  );
}
