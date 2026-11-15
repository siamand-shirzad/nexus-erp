import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { dashboard } from "@/lib/accounting/reports";
import { getSettings } from "@/lib/accounting/setup";
import { formatAmount } from "@/lib/accounting/money";
import { rangeFrom, type Params } from "@/lib/accounting/range";
import {
  Balance,
  Empty,
  F,
  PageTitle,
  Panel,
  Stat,
  Table,
  btn,
  btnPrimary,
  input,
  ledgerHref,
  linkCls,
  rowCls,
  td,
  tdR,
  th,
  thR,
} from "@/components/accounting/ui";

export default async function AccountingDashboard({ searchParams }: { searchParams: Params }) {
  await requireBooksAccess();
  const { from, to } = await rangeFrom(await searchParams);
  const [d, s] = await Promise.all([dashboard({ from, to }), getSettings()]);
  const fmt = (n: number) => formatAmount(n, s.decimals);
  const period = `from=${from}&to=${to}`;

  return (
    <>
      <PageTitle
        title="Accounting"
        description={`${s.businessName} · amounts in ${s.currencyCode} (${s.currencyLabel})`}
        actions={
          <>
            <Link href="/accounting/quick" className={btn}>
              Quick transaction
            </Link>
            <Link href="/accounting/journal/new" className={btnPrimary}>
              New journal entry
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Bank and cash balances">
          {d.banks.length ? (
            <Table>
              <thead>
                <tr>
                  <th className={th}>Account</th>
                  <th className={th}>Ledger</th>
                  <th className={thR}>Balance today</th>
                </tr>
              </thead>
              <tbody>
                {d.banks.map((b) => (
                  <tr key={b.bankAccountId} className={rowCls}>
                    <td className={td}>
                      <Link href={`/accounting/bank/${b.bankAccountId}`} className={linkCls}>
                        {b.name}
                      </Link>
                    </td>
                    <td className={td}>{b.accountCode}</td>
                    <td className={tdR}>
                      <Link href={ledgerHref({ account: b.accountId })} className={linkCls}>
                        <Balance value={b.balance} decimals={s.decimals} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>No bank or cash accounts yet.</Empty>
          )}
        </Panel>

        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Total receivables"
            value={fmt(d.receivables)}
            hint="Owed to the business"
            href="/accounting/reports/parties"
          />
          <Stat
            label="Total payables"
            value={fmt(d.payables)}
            hint="Owed by the business"
            href="/accounting/reports/parties"
          />
          <Stat
            label="Unmatched bank transactions"
            value={d.unmatched.count}
            hint={`Value ${fmt(d.unmatched.value)}`}
            href="/accounting/reconciliation"
          />
          <Stat
            label="Draft entries"
            value={d.drafts.length}
            hint="Not in any report until posted"
            href="/accounting/journal?status=draft"
          />
        </div>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
        <F label="Period from">
          <input type="date" name="from" defaultValue={from} className={input} />
        </F>
        <F label="to">
          <input type="date" name="to" defaultValue={to} className={input} />
        </F>
        <button className={btn}>Apply</button>
      </form>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Panel title={`Money movements, ${from} to ${to}`}>
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Stat label="Receipts" value={fmt(d.receipts)} href={`/accounting/reports/cash-movements?${period}`} />
            <Stat label="Payments" value={fmt(d.payments)} href={`/accounting/reports/cash-movements?${period}`} />
          </div>
          <p className="px-4 pb-3 text-[12px] text-slate-500">
            Money in and out of bank and cash accounts. Transfers between your own accounts are excluded. This
            is cash movement, not profit.
          </p>
        </Panel>
        <Panel title={`Operating result, ${from} to ${to}`}>
          <div className="grid gap-4 p-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <Stat label="Income" value={fmt(d.income)} href={`/accounting/reports/income-statement?${period}`} />
            <Stat label="Expenses" value={fmt(d.expenses)} href={`/accounting/reports/income-statement?${period}`} />
            <Stat
              label={d.netResult < 0 ? "Net loss" : "Net profit"}
              value={fmt(Math.abs(d.netResult))}
              href={`/accounting/reports/income-statement?${period}`}
            />
          </div>
          <p className="px-4 pb-3 text-[12px] text-slate-500">
            From posted income and expense accounts, whether or not cash has moved yet.
          </p>
        </Panel>
      </div>

      <Panel title="Drafts requiring attention" className="mt-4">
        {d.drafts.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Description</th>
                <th className={thR}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.drafts.map((e) => (
                <tr key={e.id} className={rowCls}>
                  <td className={td}>{e.date}</td>
                  <td className={td}>
                    <Link href={`/accounting/journal/${e.id}`} className={linkCls}>
                      {e.description || "(no description)"}
                    </Link>
                  </td>
                  <td className={tdR}>{fmt(e.total)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>No drafts. Everything entered has been posted.</Empty>
        )}
      </Panel>
    </>
  );
}
