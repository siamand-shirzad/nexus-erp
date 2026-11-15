import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { AccCategory } from "@/db/accounting-schema";
import { clean, isIsoDate, num, type DbLike } from "./core";
import { listAccounts, listBankAccounts, withDescendants, type AccountRow } from "./masterdata";

// Every report reads the same data: lines of POSTED entries, with inclusive date boundaries.
// Balances are debit-positive (debits minus credits); see money.ts drCr().

const POSTED = sql`e.status = 'posted'`;
const where = (conds: SQL[]) => sql.join(conds, sql` and `);
const rowsOf = async (tx: DbLike, q: SQL) =>
  (await tx.execute(q)).rows as Array<Record<string, unknown>>;

interface Range {
  from?: string;
  to?: string;
}
function dateConds({ from, to }: Range): SQL[] {
  const c: SQL[] = [];
  if (isIsoDate(from)) c.push(sql`e.date >= ${from}`);
  if (isIsoDate(to)) c.push(sql`e.date <= ${to}`);
  return c;
}

/** Debit and credit totals per account for posted lines matching the conditions. */
async function totalsByAccount(tx: DbLike, conds: SQL[]) {
  const rows = await rowsOf(
    tx,
    sql`select l.account_id, sum(l.debit) as debit, sum(l.credit) as credit
          from acc_lines l join acc_entries e on e.id = l.entry_id
         where ${where([POSTED, ...conds])}
         group by l.account_id`
  );
  return new Map(rows.map((r) => [String(r.account_id), { debit: num(r.debit), credit: num(r.credit) }]));
}

/** Adds each account's own figures into all of its ancestors. Leaves carry the only "own" values, so nothing is double-counted. */
function rollup(accounts: AccountRow[], own: Map<string, number[]>, width: number) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out = new Map(accounts.map((a) => [a.id, new Array<number>(width).fill(0)]));
  for (const [id, values] of own) {
    for (let cur = byId.get(id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
      const t = out.get(cur.id)!;
      values.forEach((v, i) => (t[i] += v));
    }
  }
  return out;
}

export interface ReportAccount {
  id: string;
  code: string;
  name: string;
  category: AccCategory;
  depth: number;
  postable: boolean;
}
const pick = (a: AccountRow): ReportAccount => ({
  id: a.id,
  code: a.code,
  name: a.name,
  category: a.category,
  depth: a.depth,
  postable: a.postable,
});

// --------------------------------------------------------------- trial balance
export interface TrialBalanceRow extends ReportAccount {
  opening: number; // debit-positive balance before `from`
  debit: number; // movement in range
  credit: number;
  closing: number; // debit-positive
}

export async function trialBalance(range: Range, tx: DbLike = db) {
  const accounts = await listAccounts(tx);
  const period = await totalsByAccount(tx, dateConds(range));
  const before = isIsoDate(range.from)
    ? await totalsByAccount(tx, [sql`e.date < ${range.from}`])
    : new Map<string, { debit: number; credit: number }>();
  const own = new Map<string, number[]>();
  for (const a of accounts) {
    const p = period.get(a.id);
    const b = before.get(a.id);
    if (p || b) own.set(a.id, [(b?.debit ?? 0) - (b?.credit ?? 0), p?.debit ?? 0, p?.credit ?? 0]);
  }
  const rolled = rollup(accounts, own, 3);
  const rows: TrialBalanceRow[] = accounts
    .map((a) => {
      const [opening, debit, credit] = rolled.get(a.id)!;
      return { ...pick(a), opening, debit, credit, closing: opening + debit - credit };
    })
    .filter((r) => r.opening || r.debit || r.credit);
  // totals come from posting accounts only (parents are aggregates of them)
  const leaves = rows.filter((r) => r.postable);
  const totals = {
    debit: leaves.reduce((s, r) => s + r.debit, 0),
    credit: leaves.reduce((s, r) => s + r.credit, 0),
    closingDebit: leaves.reduce((s, r) => s + (r.closing > 0 ? r.closing : 0), 0),
    closingCredit: leaves.reduce((s, r) => s + (r.closing < 0 ? -r.closing : 0), 0),
  };
  return { rows, totals, balanced: totals.closingDebit === totals.closingCredit };
}

// ------------------------------------------------- income statement / balance sheet
export interface SectionRow extends ReportAccount {
  amount: number; // in the section's natural sign
}

function section(
  accounts: AccountRow[],
  balances: Map<string, { debit: number; credit: number }>,
  category: AccCategory
) {
  const sign = category === "asset" || category === "expense" ? 1 : -1;
  const own = new Map<string, number[]>();
  for (const a of accounts) {
    const b = balances.get(a.id);
    if (b && a.category === category) own.set(a.id, [sign * (b.debit - b.credit)]);
  }
  const rolled = rollup(accounts, own, 1);
  const rows: SectionRow[] = accounts
    .filter((a) => a.category === category && rolled.get(a.id)![0] !== 0)
    .map((a) => ({ ...pick(a), amount: rolled.get(a.id)![0] }));
  const total = [...own.values()].reduce((s, v) => s + v[0], 0);
  return { rows, total };
}

/** Operating result for a period. Year-end closing entries are excluded so a closed year still reports its result. */
export async function incomeStatement(range: Range, tx: DbLike = db) {
  const accounts = await listAccounts(tx);
  const balances = await totalsByAccount(tx, [...dateConds(range), sql`e.kind <> 'closing'`]);
  const income = section(accounts, balances, "income");
  const expenses = section(accounts, balances, "expense");
  return { income, expenses, netResult: income.total - expenses.total };
}

export async function balanceSheet(asOf: string, tx: DbLike = db) {
  const accounts = await listAccounts(tx);
  const balances = await totalsByAccount(tx, dateConds({ to: asOf }));
  const assets = section(accounts, balances, "asset");
  const liabilities = section(accounts, balances, "liability");
  const equity = section(accounts, balances, "equity");
  // Income and expense balances not yet closed into retained earnings.
  // Closing entries are included here, so closed years contribute exactly zero.
  const currentEarnings =
    section(accounts, balances, "income").total - section(accounts, balances, "expense").total;
  const totalEquity = equity.total + currentEarnings;
  return {
    assets,
    liabilities,
    equity,
    currentEarnings,
    totalEquity,
    totalLiabilitiesAndEquity: liabilities.total + totalEquity,
    balanced: assets.total === liabilities.total + totalEquity,
  };
}

// ---------------------------------------------------------------------- ledgers
export interface LedgerOpts extends Range {
  /** a posting account, or a parent account (its descendants are included) */
  accountId?: string;
  /** restricts the ledger to one party; without accountId it covers the party's control accounts */
  partyId?: string;
  entryNumber?: string;
  description?: string;
  amountMin?: number | null;
  amountMax?: number | null;
}
export interface LedgerRow {
  lineId: string;
  entryId: string;
  entryNumber: string;
  date: string;
  description: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountCategory: AccCategory;
  partyId: string | null;
  partyName: string | null;
  debit: number;
  credit: number;
  balance: number; // running, debit-positive
}

async function scopeConds(tx: DbLike, opts: LedgerOpts): Promise<SQL[]> {
  const conds: SQL[] = [POSTED];
  if (opts.accountId) {
    const ids = withDescendants(await listAccounts(tx), opts.accountId);
    conds.push(sql`l.account_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (opts.partyId) {
    conds.push(sql`l.party_id = ${opts.partyId}`);
    if (!opts.accountId) conds.push(sql`a.requires_party`);
  }
  return conds;
}

/**
 * Detailed ledger with opening balance, running balance and closing balance.
 * Ordering is stable: date, then posting sequence, then line number.
 * Text/amount filters only hide rows; running balances still reflect every transaction.
 */
export async function ledger(opts: LedgerOpts, tx: DbLike = db) {
  const scope = await scopeConds(tx, opts);
  let opening = 0;
  if (isIsoDate(opts.from)) {
    const [o] = await rowsOf(
      tx,
      sql`select coalesce(sum(l.debit) - sum(l.credit), 0) as b
            from acc_lines l join acc_entries e on e.id = l.entry_id
            join acc_accounts a on a.id = l.account_id
           where ${where([...scope, sql`e.date < ${opts.from}`])}`
    );
    opening = num(o.b);
  }
  const raw = await rowsOf(
    tx,
    sql`select l.id, l.entry_id, e.entry_number, e.date::text as date,
               coalesce(nullif(l.description, ''), e.description) as description,
               l.account_id, a.code, a.name, a.category::text as category,
               l.party_id, p.name as party_name, l.debit, l.credit
          from acc_lines l
          join acc_entries e on e.id = l.entry_id
          join acc_accounts a on a.id = l.account_id
          left join acc_parties p on p.id = l.party_id
         where ${where([...scope, ...dateConds(opts)])}
         order by e.date, e.seq, l.line_no`
  );
  let balance = opening;
  const all: LedgerRow[] = raw.map((r) => {
    balance += num(r.debit) - num(r.credit);
    return {
      lineId: String(r.id),
      entryId: String(r.entry_id),
      entryNumber: String(r.entry_number),
      date: String(r.date),
      description: String(r.description ?? ""),
      accountId: String(r.account_id),
      accountCode: String(r.code),
      accountName: String(r.name),
      accountCategory: r.category as AccCategory,
      partyId: (r.party_id as string) ?? null,
      partyName: (r.party_name as string) ?? null,
      debit: num(r.debit),
      credit: num(r.credit),
      balance,
    };
  });
  const closing = balance;

  const en = clean(opts.entryNumber).toLowerCase();
  const desc = clean(opts.description).toLowerCase();
  const filtered = !!(en || desc || opts.amountMin != null || opts.amountMax != null);
  const rows = all.filter((r) => {
    const amount = r.debit || r.credit;
    return (
      (!en || r.entryNumber.toLowerCase().includes(en)) &&
      (!desc || r.description.toLowerCase().includes(desc)) &&
      (opts.amountMin == null || amount >= opts.amountMin) &&
      (opts.amountMax == null || amount <= opts.amountMax)
    );
  });
  return {
    opening,
    rows,
    totalDebit: rows.reduce((s, r) => s + r.debit, 0),
    totalCredit: rows.reduce((s, r) => s + r.credit, 0),
    closing,
    filtered,
  };
}
export type LedgerResult = Awaited<ReturnType<typeof ledger>>;

/** One ledger per posting account that has an opening balance or movement in the range. */
export async function generalLedger(range: Range, tx: DbLike = db) {
  const accounts = (await listAccounts(tx)).filter((a) => a.postable);
  const out: Array<{ account: ReportAccount; ledger: LedgerResult }> = [];
  // ponytail: one query pair per account; fine for a small chart, batch it if the chart grows into the hundreds
  for (const a of accounts) {
    if (!a.lineCount) continue;
    const l = await ledger({ ...range, accountId: a.id }, tx);
    if (l.opening || l.rows.length) out.push({ account: pick(a), ledger: l });
  }
  return out;
}

export async function generalJournal(range: Range, tx: DbLike = db) {
  const raw = await rowsOf(
    tx,
    sql`select e.id as entry_id, e.entry_number, e.date::text as date, e.description, e.reference, e.kind,
               l.line_no, a.code, a.name, p.name as party_name, l.debit, l.credit, l.description as line_description
          from acc_lines l
          join acc_entries e on e.id = l.entry_id
          join acc_accounts a on a.id = l.account_id
          left join acc_parties p on p.id = l.party_id
         where ${where([POSTED, ...dateConds(range)])}
         order by e.date, e.seq, l.line_no`
  );
  const entries: Array<{
    id: string;
    entryNumber: string;
    date: string;
    description: string;
    reference: string | null;
    kind: string;
    lines: Array<{ code: string; name: string; partyName: string | null; debit: number; credit: number; description: string | null }>;
  }> = [];
  for (const r of raw) {
    let e = entries[entries.length - 1];
    if (!e || e.id !== r.entry_id) {
      e = {
        id: String(r.entry_id),
        entryNumber: String(r.entry_number),
        date: String(r.date),
        description: String(r.description),
        reference: (r.reference as string) ?? null,
        kind: String(r.kind),
        lines: [],
      };
      entries.push(e);
    }
    e.lines.push({
      code: String(r.code),
      name: String(r.name),
      partyName: (r.party_name as string) ?? null,
      debit: num(r.debit),
      credit: num(r.credit),
      description: (r.line_description as string) ?? null,
    });
  }
  const total = entries.reduce((s, e) => s + e.lines.reduce((t, l) => t + l.debit, 0), 0);
  return { entries, total };
}

// ---------------------------------------------------------------------- parties
export interface PartyBalance {
  partyId: string;
  name: string;
  code: string | null;
  isActive: boolean;
  /** owed to the business: debit balance on asset control accounts */
  receivable: number;
  /** owed by the business: credit balance on liability control accounts */
  payable: number;
  /** balance on other control accounts, debit-positive */
  other: number;
}

/** Balances per party on control accounts (accounts that require a party), as of a date. */
export async function partyBalances(asOf?: string, tx: DbLike = db): Promise<PartyBalance[]> {
  const raw = await rowsOf(
    tx,
    sql`select p.id, p.name, p.code, p.is_active,
               coalesce(sum(case when a.category = 'asset' then l.debit - l.credit end), 0) as receivable,
               coalesce(sum(case when a.category = 'liability' then l.credit - l.debit end), 0) as payable,
               coalesce(sum(case when a.category not in ('asset','liability') then l.debit - l.credit end), 0) as other
          from acc_parties p
          left join (acc_lines l
                     join acc_entries e on e.id = l.entry_id and ${where([POSTED, ...dateConds({ to: asOf })])}
                     join acc_accounts a on a.id = l.account_id and a.requires_party)
                 on l.party_id = p.id
         group by p.id, p.name, p.code, p.is_active
         order by p.name`
  );
  return raw.map((r) => ({
    partyId: String(r.id),
    name: String(r.name),
    code: (r.code as string) ?? null,
    isActive: !!r.is_active,
    receivable: num(r.receivable),
    payable: num(r.payable),
    other: num(r.other),
  }));
}

// ---------------------------------------------------------- bank & cash movements
export interface CashMovementRow {
  bankAccountId: string;
  name: string;
  kind: string;
  accountId: string;
  accountCode: string;
  opening: number;
  receipts: number;
  payments: number;
  transfersIn: number;
  transfersOut: number;
  closing: number;
}

/**
 * Money movements per bank/cash account. An entry whose bank/cash lines net to zero across
 * two or more of the business's own accounts is an internal transfer and is reported
 * separately from external receipts and payments.
 * ponytail: an entry mixing a transfer with an external amount is counted wholly as external.
 */
export async function cashMovements(range: Range, tx: DbLike = db) {
  const banks = await listBankAccounts(tx);
  const rows: CashMovementRow[] = banks.map((b) => ({
    bankAccountId: b.id,
    name: b.name,
    kind: b.kind,
    accountId: b.accountId,
    accountCode: b.accountCode,
    opening: 0,
    receipts: 0,
    payments: 0,
    transfersIn: 0,
    transfersOut: 0,
    closing: 0,
  }));
  if (!banks.length) return { rows, receipts: 0, payments: 0 };
  const byAccount = new Map(rows.map((r) => [r.accountId, r]));
  const ids = sql.join(banks.map((b) => sql`${b.accountId}`), sql`, `);

  if (isIsoDate(range.from)) {
    const open = await totalsByAccount(tx, [sql`e.date < ${range.from}`, sql`l.account_id in (${ids})`]);
    for (const [id, t] of open) byAccount.get(id)!.opening = t.debit - t.credit;
  }
  const lines = await rowsOf(
    tx,
    sql`select l.entry_id, l.account_id, l.debit - l.credit as amount, e.kind
          from acc_lines l join acc_entries e on e.id = l.entry_id
         where ${where([POSTED, ...dateConds(range), sql`l.account_id in (${ids})`])}`
  );
  const perEntry = new Map<string, { net: number; accounts: Set<string> }>();
  for (const l of lines) {
    const e = perEntry.get(String(l.entry_id)) ?? { net: 0, accounts: new Set<string>() };
    e.net += num(l.amount);
    e.accounts.add(String(l.account_id));
    perEntry.set(String(l.entry_id), e);
  }
  for (const l of lines) {
    const r = byAccount.get(String(l.account_id))!;
    const e = perEntry.get(String(l.entry_id))!;
    const amount = num(l.amount);
    const transfer = e.net === 0 && e.accounts.size >= 2;
    // balances entered through an opening journal are starting positions, not money received or paid
    if (l.kind === "opening") {
      r.opening += amount;
      continue;
    }
    if (transfer && amount > 0) r.transfersIn += amount;
    else if (transfer) r.transfersOut -= amount;
    else if (amount > 0) r.receipts += amount;
    else r.payments -= amount;
  }
  for (const r of rows)
    r.closing = r.opening + r.receipts - r.payments + r.transfersIn - r.transfersOut;
  return {
    rows,
    receipts: rows.reduce((s, r) => s + r.receipts, 0),
    payments: rows.reduce((s, r) => s + r.payments, 0),
  };
}

// -------------------------------------------------------------------- dashboard
export async function dashboard(range: Range, tx: DbLike = db) {
  const [cash, balancesNow, parties, pl, unmatched, drafts] = await Promise.all([
    cashMovements(range, tx),
    cashMovements({}, tx),
    partyBalances(undefined, tx),
    incomeStatement(range, tx),
    rowsOf(
      tx,
      sql`select count(*)::int as n, coalesce(sum(abs(amount)), 0) as value
            from acc_statement_lines where match_id is null`
    ),
    rowsOf(
      tx,
      sql`select e.id, e.date::text as date, e.description,
                 coalesce((select sum(debit) from acc_lines l where l.entry_id = e.id), 0) as total
            from acc_entries e where e.status = 'draft' order by e.date, e.created_at limit 20`
    ),
  ]);
  return {
    banks: balancesNow.rows.map((r) => ({
      bankAccountId: r.bankAccountId,
      name: r.name,
      kind: r.kind,
      accountId: r.accountId,
      accountCode: r.accountCode,
      balance: r.closing,
    })),
    receivables: parties.reduce((s, p) => s + p.receivable, 0),
    payables: parties.reduce((s, p) => s + p.payable, 0),
    receipts: cash.receipts,
    payments: cash.payments,
    income: pl.income.total,
    expenses: pl.expenses.total,
    netResult: pl.netResult,
    unmatched: { count: num(unmatched[0].n), value: num(unmatched[0].value) },
    drafts: drafts.map((d) => ({
      id: String(d.id),
      date: String(d.date),
      description: String(d.description),
      total: num(d.total),
    })),
  };
}
