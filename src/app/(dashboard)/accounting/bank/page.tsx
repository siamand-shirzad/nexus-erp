import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { listAccounts, listBankAccounts } from "@/lib/accounting/masterdata";
import { cashMovements } from "@/lib/accounting/reports";
import { getSettings } from "@/lib/accounting/setup";
import { formatAmount } from "@/lib/accounting/money";
import { rangeFrom, type Params } from "@/lib/accounting/range";
import {
  Balance,
  Empty,
  F,
  PageTitle,
  Panel,
  Pill,
  Table,
  btn,
  input,
  ledgerHref,
  linkCls,
  rowCls,
  td,
  tdR,
  th,
  thR,
} from "@/components/accounting/ui";
import { BankAccountEditor } from "./BankViews";

export default async function BankPage({ searchParams }: { searchParams: Params }) {
  await requireBooksAccess();
  const { from, to } = await rangeFrom(await searchParams);
  const [banks, accounts, period, now, s, unmatched] = await Promise.all([
    listBankAccounts(),
    listAccounts(),
    cashMovements({ from, to }),
    cashMovements({}),
    getSettings(),
    db.execute(sql`select bank_account_id, count(*)::int as n from acc_statement_lines where match_id is null group by bank_account_id`),
  ]);
  const fmt = (n: number) => formatAmount(n, s.decimals);
  const linked = new Set(banks.map((b) => b.accountId));
  const ledgerAccounts = accounts
    .filter((a) => a.category === "asset" && a.postable)
    .map((a) => ({ id: a.id, label: `${a.code} · ${a.name}${linked.has(a.id) ? " (linked)" : ""}` }));
  const unmatchedBy = new Map(unmatched.rows.map((r) => [String(r.bank_account_id), Number(r.n)]));

  return (
    <>
      <PageTitle
        title="Bank & Cash"
        description="Each account is linked to its ledger account. Balances come from posted journal lines; imported bank statements are kept separately."
        actions={<BankAccountEditor ledgerAccounts={ledgerAccounts} />}
      />
      <form method="get" className="mb-3 flex flex-wrap items-end gap-3 print:hidden">
        <F label="Receipts and payments from">
          <input type="date" name="from" defaultValue={from} className={input} />
        </F>
        <F label="to">
          <input type="date" name="to" defaultValue={to} className={input} />
        </F>
        <button className={btn}>Apply</button>
      </form>
      <Panel>
        {banks.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Account</th>
                <th className={th}>Ledger account</th>
                <th className={thR}>Receipts</th>
                <th className={thR}>Payments</th>
                <th className={thR}>Ledger balance today</th>
                <th className={thR}>Unmatched statement lines</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {banks.map((b) => {
                const p = period.rows.find((r) => r.bankAccountId === b.id)!;
                const n = now.rows.find((r) => r.bankAccountId === b.id)!;
                return (
                  <tr key={b.id} className={rowCls + (b.isActive ? "" : " opacity-60")}>
                    <td className={td}>
                      <Link href={`/accounting/bank/${b.id}`} className={linkCls}>
                        {b.name}
                      </Link>{" "}
                      <Pill tone={b.kind === "bank" ? "indigo" : "slate"}>{b.kind === "bank" ? "Bank" : "Cash"}</Pill>
                      {b.bankName && <span className="ml-1 text-slate-500">{b.bankName}</span>}
                    </td>
                    <td className={td}>
                      <Link href={ledgerHref({ account: b.accountId, from, to })} className={linkCls}>
                        {b.accountCode}
                      </Link>{" "}
                      {b.accountName}
                    </td>
                    <td className={tdR}>{fmt(p.receipts)}</td>
                    <td className={tdR}>{fmt(p.payments)}</td>
                    <td className={tdR}>
                      <Balance value={n.closing} decimals={s.decimals} />
                    </td>
                    <td className={tdR}>
                      {b.kind === "bank" ? (
                        <Link href={`/accounting/reconciliation?bank=${b.id}`} className={linkCls}>
                          {unmatchedBy.get(b.id) ?? 0}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={td + " whitespace-nowrap text-right"}>
                      <BankAccountEditor bank={b} ledgerAccounts={ledgerAccounts} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <Empty>No bank or cash accounts yet.</Empty>
        )}
      </Panel>
      <p className="mt-2 text-[12px] text-slate-500">
        Receipts and payments exclude transfers between your own accounts; see Reports &rarr; Bank and cash movements for the split.
      </p>
    </>
  );
}
