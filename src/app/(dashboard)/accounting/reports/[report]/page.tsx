import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { AccSettings } from "@/db/accounting-schema";
import { listAccounts, listParties } from "@/lib/accounting/masterdata";
import {
  balanceSheet,
  cashMovements,
  generalJournal,
  generalLedger,
  incomeStatement,
  ledger,
  partyBalances,
  trialBalance,
  type SectionRow,
} from "@/lib/accounting/reports";
import { getSettings } from "@/lib/accounting/setup";
import { drCr, formatAmount, parseAmount, toMajor } from "@/lib/accounting/money";
import { one, rangeFrom, type Params } from "@/lib/accounting/range";
import { ExportButtons } from "@/components/accounting/kit";
import { LedgerTable, ledgerExport } from "@/components/accounting/LedgerTable";
import {
  Balance,
  Empty,
  EntryLink,
  F,
  KIND_LABEL,
  Money,
  PageTitle,
  Panel,
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
  totalRow,
} from "@/components/accounting/ui";

type Cell = string | number | null;
interface Ctx {
  p: Record<string, string | string[] | undefined>;
  s: AccSettings;
  from: string;
  to: string;
}
interface Built {
  title: string;
  /** which date inputs the filter form shows */
  dates: "range" | "asOf";
  meta: string[];
  filters?: ReactNode;
  columns: string[];
  rows: Cell[][];
  body: ReactNode;
}

const indent = (depth: number) => ({ paddingLeft: 12 + depth * 16 });

export default async function ReportPage({ params, searchParams }: { params: Promise<{ report: string }>; searchParams: Params }) {
  await requireBooksAccess();
  const { report } = await params;
  const build = BUILDERS[report];
  if (!build) notFound();
  const p = await searchParams;
  const [s, range] = await Promise.all([getSettings(), rangeFrom(p)]);
  const r = await build({ p, s, from: range.from, to: range.to });
  const period = r.dates === "range" ? `Period: ${range.from} to ${range.to}` : `As of ${range.to}`;
  const meta = [s.businessName, period, ...r.meta, `Currency: ${s.currencyCode} (${s.currencyLabel})`];

  return (
    <>
      <PageTitle
        title={r.title}
        description={meta.join(" · ")}
        actions={
          <>
            <Link href="/accounting/reports" className={btn}>
              All reports
            </Link>
            <ExportButtons title={r.title} meta={meta} columns={r.columns} rows={r.rows} />
          </>
        }
      />
      <form method="get" className="mb-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-6 print:hidden">
        {r.dates === "range" && (
          <F label="From">
            <input type="date" name="from" defaultValue={range.from} className={input} />
          </F>
        )}
        <F label={r.dates === "range" ? "To" : "As of"}>
          <input type="date" name="to" defaultValue={range.to} className={input} />
        </F>
        {r.filters}
        <button className={btn}>Run report</button>
      </form>
      {r.body}
    </>
  );
}

// ------------------------------------------------------------------- builders
const BUILDERS: Record<string, (c: Ctx) => Promise<Built>> = {
  async ledger({ p, s, from, to }) {
    const [accounts, parties] = await Promise.all([listAccounts(), listParties()]);
    const accountId = one(p.account);
    const partyId = one(p.party);
    const account = accounts.find((a) => a.id === accountId);
    const party = parties.find((x) => x.id === partyId);
    const amt = (key: string) => (one(p[key]).trim() ? parseAmount(one(p[key]), s.decimals) : null);
    const chosen = account || party;
    const l = chosen
      ? await ledger({
          accountId: account?.id,
          partyId: party?.id,
          from,
          to,
          entryNumber: one(p.entry),
          description: one(p.q),
          amountMin: amt("min"),
          amountMax: amt("max"),
        })
      : null;
    const exp = l ? ledgerExport(l, s.decimals) : { columns: [], rows: [] };
    return {
      title: account ? `Ledger: ${account.code} ${account.name}` : party ? `Ledger: ${party.name}` : "Account ledger",
      dates: "range",
      meta: [
        ...(account ? [`Account: ${account.code} ${account.name}`] : []),
        ...(party ? [`Party: ${party.name}`] : []),
        ...(one(p.entry) ? [`Entry contains "${one(p.entry)}"`] : []),
        ...(one(p.q) ? [`Description contains "${one(p.q)}"`] : []),
        ...(amt("min") != null ? [`Amount from ${formatAmount(amt("min")!, s.decimals)}`] : []),
        ...(amt("max") != null ? [`Amount up to ${formatAmount(amt("max")!, s.decimals)}`] : []),
      ],
      filters: (
        <>
          <F label="Account" className="col-span-2">
            <select name="account" defaultValue={accountId} className={input}>
              <option value="">{party ? "All party accounts" : "Choose an account…"}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {" ".repeat(a.depth * 2)}
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </F>
          <F label="Party">
            <select name="party" defaultValue={partyId} className={input}>
              <option value="">Any</option>
              {parties.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </F>
          <F label="Entry number">
            <input name="entry" defaultValue={one(p.entry)} className={input} placeholder="JE-…" />
          </F>
          <F label="Description contains">
            <input name="q" defaultValue={one(p.q)} className={input} />
          </F>
          <F label="Amount from">
            <input name="min" defaultValue={one(p.min)} className={input} inputMode="decimal" />
          </F>
          <F label="Amount to">
            <input name="max" defaultValue={one(p.max)} className={input} inputMode="decimal" />
          </F>
        </>
      ),
      columns: exp.columns,
      rows: exp.rows,
      body: l ? (
        <>
          <Panel>
            <LedgerTable l={l} decimals={s.decimals} from={from} showAccount={!account?.postable} />
          </Panel>
          <p className="mt-2 text-[12px] text-slate-500">
            Balances are debits minus credits: Dr is a debit balance, Cr a credit balance. Rows are ordered by date, then posting
            number, then line. {l.filtered && "Filters hide rows only; running and closing balances still include every transaction. "}
            Click a row to open its journal entry.
          </p>
        </>
      ) : (
        <Panel>
          <Empty>Select an account (or a party), choose the dates, and run the report.</Empty>
        </Panel>
      ),
    };
  },

  async "general-ledger"({ s, from, to }) {
    const gl = await generalLedger({ from, to });
    const rows: Cell[][] = [];
    for (const g of gl) {
      const exp = ledgerExport(g.ledger, s.decimals);
      rows.push([`${g.account.code} ${g.account.name}`, "", "", "", "", null, null, null, ""], ...exp.rows, []);
    }
    return {
      title: "General ledger",
      dates: "range",
      meta: [],
      columns: ["Date", "Entry", "Description", "Account", "Party", "Debit", "Credit", "Balance", "Dr/Cr"],
      rows,
      body: gl.length ? (
        <div className="space-y-4">
          {gl.map((g) => (
            <Panel
              key={g.account.id}
              title={
                <Link href={ledgerHref({ account: g.account.id, from, to })} className={linkCls}>
                  {g.account.code} · {g.account.name}
                </Link>
              }
            >
              <LedgerTable l={g.ledger} decimals={s.decimals} from={from} />
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty>No posted transactions in this period.</Empty>
        </Panel>
      ),
    };
  },

  async journal({ s, from, to }) {
    const j = await generalJournal({ from, to });
    const m = (n: number) => (n ? toMajor(n, s.decimals) : null);
    return {
      title: "General journal",
      dates: "range",
      meta: [],
      columns: ["Date", "Entry", "Type", "Description", "Reference", "Account", "Party", "Debit", "Credit"],
      rows: j.entries.flatMap((e) =>
        e.lines.map((l) => [e.date, e.entryNumber, KIND_LABEL[e.kind] ?? e.kind, l.description || e.description, e.reference ?? "", `${l.code} ${l.name}`, l.partyName ?? "", m(l.debit), m(l.credit)])
      ),
      body: (
        <Panel>
          {j.entries.length ? (
            <Table>
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Entry</th>
                  <th className={th}>Account</th>
                  <th className={th}>Party</th>
                  <th className={thR}>Debit</th>
                  <th className={thR}>Credit</th>
                </tr>
              </thead>
              {j.entries.map((e) => (
                <tbody key={e.id} className="border-t-2 border-slate-200">
                  <tr className="bg-slate-50/70">
                    <td className={td + " whitespace-nowrap font-medium"}>{e.date}</td>
                    <td className={td + " whitespace-nowrap"}>
                      <EntryLink id={e.id}>{e.entryNumber}</EntryLink>
                    </td>
                    <td className={td + " font-medium"} colSpan={4}>
                      {e.description}
                      {e.reference && <span className="font-normal text-slate-500"> · ref {e.reference}</span>}
                      <span className="font-normal text-slate-500"> · {KIND_LABEL[e.kind] ?? e.kind}</span>
                    </td>
                  </tr>
                  {e.lines.map((l, i) => (
                    <tr key={i} className={rowCls}>
                      <td className={td} />
                      <td className={td} />
                      <td className={td} style={l.credit ? { paddingLeft: 32 } : undefined}>
                        {l.code} {l.name}
                        {l.description && <span className="text-slate-500"> · {l.description}</span>}
                      </td>
                      <td className={td}>{l.partyName}</td>
                      <td className={tdR}>
                        <Money value={l.debit} decimals={s.decimals} />
                      </td>
                      <td className={tdR}>
                        <Money value={l.credit} decimals={s.decimals} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr className={totalRow}>
                  <td className={td} colSpan={4}>
                    Total ({j.entries.length} entries)
                  </td>
                  <td className={tdR}>{formatAmount(j.total, s.decimals)}</td>
                  <td className={tdR}>{formatAmount(j.total, s.decimals)}</td>
                </tr>
              </tfoot>
            </Table>
          ) : (
            <Empty>No posted entries in this period.</Empty>
          )}
        </Panel>
      ),
    };
  },

  async "trial-balance"({ s, from, to }) {
    const tb = await trialBalance({ from, to });
    const m = (n: number) => toMajor(n, s.decimals);
    const fmt = (n: number) => formatAmount(n, s.decimals);
    return {
      title: "Trial balance",
      dates: "range",
      meta: [tb.balanced ? "Balanced" : "NOT BALANCED"],
      columns: ["Code", "Account", "Opening", "Opening Dr/Cr", "Debit", "Credit", "Closing debit", "Closing credit"],
      rows: [
        ...tb.rows
          .filter((r) => r.postable)
          .map((r) => [r.code, r.name, m(Math.abs(r.opening)), r.opening === 0 ? "" : r.opening > 0 ? "Dr" : "Cr", m(r.debit), m(r.credit), r.closing > 0 ? m(r.closing) : null, r.closing < 0 ? m(-r.closing) : null] as Cell[]),
        ["", "Total", null, "", m(tb.totals.debit), m(tb.totals.credit), m(tb.totals.closingDebit), m(tb.totals.closingCredit)],
      ],
      body: (
        <Panel>
          {tb.rows.length ? (
            <Table>
              <thead>
                <tr>
                  <th className={th}>Code</th>
                  <th className={th}>Account</th>
                  <th className={thR}>Opening balance</th>
                  <th className={thR}>Debit</th>
                  <th className={thR}>Credit</th>
                  <th className={thR}>Closing debit</th>
                  <th className={thR}>Closing credit</th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((r) => (
                  <tr key={r.id} className={rowCls + (r.postable ? "" : " bg-slate-50/60 font-semibold text-slate-500")}>
                    <td className={td + " tnum"}>{r.code}</td>
                    <td className={td} style={indent(r.depth)}>
                      <Link href={ledgerHref({ account: r.id, from, to })} className={linkCls}>
                        {r.name}
                      </Link>
                    </td>
                    <td className={tdR}>
                      <Balance value={r.opening} decimals={s.decimals} />
                    </td>
                    <td className={tdR}>
                      <Money value={r.debit} decimals={s.decimals} />
                    </td>
                    <td className={tdR}>
                      <Money value={r.credit} decimals={s.decimals} />
                    </td>
                    <td className={tdR}>{r.closing > 0 && fmt(r.closing)}</td>
                    <td className={tdR}>{r.closing < 0 && fmt(-r.closing)}</td>
                  </tr>
                ))}
                <tr className={totalRow}>
                  <td className={td} colSpan={3}>
                    Total of posting accounts {tb.balanced ? "· balanced" : "· NOT BALANCED"}
                  </td>
                  <td className={tdR}>{fmt(tb.totals.debit)}</td>
                  <td className={tdR}>{fmt(tb.totals.credit)}</td>
                  <td className={tdR}>{fmt(tb.totals.closingDebit)}</td>
                  <td className={tdR}>{fmt(tb.totals.closingCredit)}</td>
                </tr>
              </tbody>
            </Table>
          ) : (
            <Empty>No posted transactions up to this date.</Empty>
          )}
          <p className="px-4 py-2 text-[12px] text-slate-500">
            Summary accounts (grey) show the total of their sub-accounts and are not added again in the totals.
          </p>
        </Panel>
      ),
    };
  },

  async "income-statement"({ s, from, to }) {
    const pl = await incomeStatement({ from, to });
    const fmt = (n: number) => formatAmount(n, s.decimals);
    const exp = (label: string, rows: SectionRow[], total: number): Cell[][] => [
      [label, "", null],
      ...rows.filter((r) => r.postable).map((r) => [r.code, r.name, toMajor(r.amount, s.decimals)] as Cell[]),
      ["", `Total ${label.toLowerCase()}`, toMajor(total, s.decimals)],
    ];
    return {
      title: "Income statement",
      dates: "range",
      meta: [],
      columns: ["Code", "Account", "Amount"],
      rows: [...exp("Income", pl.income.rows, pl.income.total), ...exp("Expenses", pl.expenses.rows, pl.expenses.total), ["", pl.netResult < 0 ? "Net loss" : "Net profit", toMajor(Math.abs(pl.netResult), s.decimals)]],
      body: (
        <Panel>
          <Table>
            <tbody>
              <SectionRows title="Income" rows={pl.income.rows} total={pl.income.total} s={s} from={from} to={to} />
              <SectionRows title="Expenses" rows={pl.expenses.rows} total={pl.expenses.total} s={s} from={from} to={to} />
              <tr className="border-t-2 border-slate-400 bg-slate-100 text-[14px] font-bold text-slate-900">
                <td className={td} colSpan={2}>
                  {pl.netResult < 0 ? "Net loss" : "Net profit"} for the period
                </td>
                <td className={tdR}>{fmt(Math.abs(pl.netResult))}</td>
              </tr>
            </tbody>
          </Table>
          <p className="px-4 py-2 text-[12px] text-slate-500">
            Operating result from posted income and expense accounts. It is not the same as cash received minus cash paid; see Bank and
            cash movements for that. Year-end closing entries are left out so a closed year still shows its result.
          </p>
        </Panel>
      ),
    };
  },

  async "balance-sheet"({ s, to }) {
    const bs = await balanceSheet(to);
    const fmt = (n: number) => formatAmount(n, s.decimals);
    const m = (n: number) => toMajor(n, s.decimals);
    const exp = (label: string, rows: SectionRow[]): Cell[][] => [[label, "", null], ...rows.filter((r) => r.postable).map((r) => [r.code, r.name, m(r.amount)] as Cell[])];
    return {
      title: "Balance sheet",
      dates: "asOf",
      meta: [bs.balanced ? "Balanced" : "NOT BALANCED"],
      columns: ["Code", "Account", "Amount"],
      rows: [
        ...exp("Assets", bs.assets.rows),
        ["", "Total assets", m(bs.assets.total)],
        ...exp("Liabilities", bs.liabilities.rows),
        ["", "Total liabilities", m(bs.liabilities.total)],
        ...exp("Equity", bs.equity.rows),
        ["", "Current earnings (not yet closed)", m(bs.currentEarnings)],
        ["", "Total equity", m(bs.totalEquity)],
        ["", "Total liabilities and equity", m(bs.totalLiabilitiesAndEquity)],
      ],
      body: (
        <Panel>
          <Table>
            <tbody>
              <SectionRows title="Assets" rows={bs.assets.rows} total={bs.assets.total} s={s} to={to} />
              <SectionRows title="Liabilities" rows={bs.liabilities.rows} total={bs.liabilities.total} s={s} to={to} />
              <SectionRows
                title="Equity"
                rows={bs.equity.rows}
                total={bs.totalEquity}
                s={s}
                to={to}
                extra={
                  <tr className={rowCls}>
                    <td className={td} />
                    <td className={td} style={indent(1)}>
                      <Link href={`/accounting/reports/income-statement?to=${to}`} className={linkCls}>
                        Current earnings (income less expenses not yet closed to retained earnings)
                      </Link>
                    </td>
                    <td className={tdR}>{fmt(bs.currentEarnings)}</td>
                  </tr>
                }
              />
              <tr className="border-t-2 border-slate-400 bg-slate-100 text-[14px] font-bold text-slate-900">
                <td className={td} colSpan={2}>
                  Total liabilities and equity {bs.balanced ? "· equals total assets" : "· DOES NOT EQUAL TOTAL ASSETS"}
                </td>
                <td className={tdR}>{fmt(bs.totalLiabilitiesAndEquity)}</td>
              </tr>
            </tbody>
          </Table>
        </Panel>
      ),
    };
  },

  async parties({ s, to }) {
    const all = await partyBalances(to);
    const rows = all.filter((b) => b.receivable || b.payable || b.other);
    const fmt = (n: number) => formatAmount(n, s.decimals);
    const m = (n: number) => toMajor(n, s.decimals);
    const tr = rows.reduce((t, b) => t + b.receivable, 0);
    const tp = rows.reduce((t, b) => t + b.payable, 0);
    return {
      title: "Receivables and payables by party",
      dates: "asOf",
      meta: [],
      columns: ["Party", "Code", "Receivable", "Payable", "Net (receivable minus payable)"],
      rows: [...rows.map((b) => [b.name, b.code ?? "", m(b.receivable), m(b.payable), m(b.receivable - b.payable)] as Cell[]), ["Total", "", m(tr), m(tp), m(tr - tp)]],
      body: (
        <Panel>
          {rows.length ? (
            <Table>
              <thead>
                <tr>
                  <th className={th}>Party</th>
                  <th className={th}>Code</th>
                  <th className={thR}>Receivable (owes you)</th>
                  <th className={thR}>Payable (you owe)</th>
                  <th className={thR}>Net position (receivable minus payable)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.partyId} className={rowCls}>
                    <td className={td}>
                      <Link href={`/accounting/parties/${b.partyId}?to=${to}`} className={linkCls}>
                        {b.name}
                      </Link>
                    </td>
                    <td className={td}>{b.code}</td>
                    <td className={tdR}>{fmt(b.receivable)}</td>
                    <td className={tdR}>{fmt(b.payable)}</td>
                    <td className={tdR}>{fmt(b.receivable - b.payable)}</td>
                  </tr>
                ))}
                <tr className={totalRow}>
                  <td className={td} colSpan={2}>
                    Total
                  </td>
                  <td className={tdR}>{fmt(tr)}</td>
                  <td className={tdR}>{fmt(tp)}</td>
                  <td className={tdR}>{fmt(tr - tp)}</td>
                </tr>
              </tbody>
            </Table>
          ) : (
            <Empty>No party balances at this date.</Empty>
          )}
          <p className="px-4 py-2 text-[12px] text-slate-500">
            Receivables and payables are kept separate; the net column is for information only. Click a party for its statement.
          </p>
        </Panel>
      ),
    };
  },

  async "cash-movements"({ s, from, to }) {
    const c = await cashMovements({ from, to });
    const fmt = (n: number) => formatAmount(n, s.decimals);
    const m = (n: number) => toMajor(n, s.decimals);
    return {
      title: "Bank and cash movements",
      dates: "range",
      meta: [],
      columns: ["Account", "Ledger", "Opening", "Receipts", "Payments", "Transfers in", "Transfers out", "Closing"],
      rows: [
        ...c.rows.map((r) => [r.name, r.accountCode, m(r.opening), m(r.receipts), m(r.payments), m(r.transfersIn), m(r.transfersOut), m(r.closing)] as Cell[]),
        ["Total external", "", null, m(c.receipts), m(c.payments), null, null, null],
      ],
      body: (
        <Panel>
          <Table>
            <thead>
              <tr>
                <th className={th}>Account</th>
                <th className={thR}>Opening (incl. opening-balance entries)</th>
                <th className={thR}>Receipts</th>
                <th className={thR}>Payments</th>
                <th className={thR}>Transfers in</th>
                <th className={thR}>Transfers out</th>
                <th className={thR}>Closing</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.bankAccountId} className={rowCls}>
                  <td className={td}>
                    <Link href={ledgerHref({ account: r.accountId, from, to })} className={linkCls}>
                      {r.name}
                    </Link>{" "}
                    <span className="text-slate-500">{r.accountCode}</span>
                  </td>
                  <td className={tdR}>{drCr(r.opening, s.decimals)}</td>
                  <td className={tdR}>{fmt(r.receipts)}</td>
                  <td className={tdR}>{fmt(r.payments)}</td>
                  <td className={tdR}>{fmt(r.transfersIn)}</td>
                  <td className={tdR}>{fmt(r.transfersOut)}</td>
                  <td className={tdR}>{drCr(r.closing, s.decimals)}</td>
                </tr>
              ))}
              <tr className={totalRow}>
                <td className={td} colSpan={2}>
                  External receipts and payments
                </td>
                <td className={tdR}>{fmt(c.receipts)}</td>
                <td className={tdR}>{fmt(c.payments)}</td>
                <td className={tdR} colSpan={3} />
              </tr>
            </tbody>
          </Table>
          <p className="px-4 py-2 text-[12px] text-slate-500">
            Cash movements, not profit. Transfers between your own bank and cash accounts are shown separately and are not counted as
            receipts or payments. Click an account for the ledger lines behind the figures.
          </p>
        </Panel>
      ),
    };
  },
};

function SectionRows({
  title,
  rows,
  total,
  s,
  from,
  to,
  extra,
}: {
  title: string;
  rows: SectionRow[];
  total: number;
  s: AccSettings;
  from?: string;
  to: string;
  extra?: ReactNode;
}) {
  return (
    <>
      <tr className="border-t border-slate-300 bg-slate-50">
        <td className={td + " text-[12px] font-bold uppercase tracking-wide text-slate-600"} colSpan={3}>
          {title}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.id} className={rowCls + (r.postable ? "" : " font-semibold text-slate-500")}>
          <td className={td + " tnum"} style={{ width: 90 }}>
            {r.code}
          </td>
          <td className={td} style={indent(r.depth)}>
            <Link href={ledgerHref({ account: r.id, from, to })} className={linkCls}>
              {r.name}
            </Link>
          </td>
          <td className={tdR}>{formatAmount(r.amount, s.decimals)}</td>
        </tr>
      ))}
      {extra}
      <tr className={totalRow}>
        <td className={td} colSpan={2}>
          Total {title.toLowerCase()}
        </td>
        <td className={tdR}>{formatAmount(total, s.decimals)}</td>
      </tr>
    </>
  );
}
