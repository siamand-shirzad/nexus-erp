import { and, asc, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accSettings,
  accAccounts,
  accBankAccounts,
  accFiscalYears,
  accPeriods,
  accEntries,
  accLines,
  accStatementLines,
  type AccCategory,
  type AccSettings,
} from "@/db/accounting-schema";
import {
  addDays,
  addMonths,
  audit,
  clean,
  fail,
  isIsoDate,
  num,
  todayIso,
  transaction,
  type DbLike,
  type Tx,
} from "./core";
import { createEntryTx, reverseEntryTx, type LineInput } from "./journal";

// --------------------------------------------------------------- starter data
// [code, name, category, parent code, flags]  g = summary (no posting), p = party required
const STARTER_CHART: Array<[string, string, AccCategory, string | null, string?]> = [
  ["1000", "Assets", "asset", null, "g"],
  ["1100", "Cash and Bank", "asset", "1000", "g"],
  ["1110", "Cash on Hand", "asset", "1100"],
  ["1120", "Bank - Main Account", "asset", "1100"],
  ["1130", "Bank - Savings Account", "asset", "1100"],
  ["1200", "Accounts Receivable", "asset", "1000", "p"],
  ["1500", "Equipment", "asset", "1000"],
  ["2000", "Liabilities", "liability", null, "g"],
  ["2100", "Accounts Payable", "liability", "2000", "p"],
  ["2200", "Loans Payable", "liability", "2000"],
  ["3000", "Equity", "equity", null, "g"],
  ["3100", "Owner's Capital", "equity", "3000"],
  ["3200", "Owner's Drawings", "equity", "3000"],
  ["3300", "Retained Earnings", "equity", "3000"],
  ["3900", "Opening Balance Equity", "equity", "3000"],
  ["4000", "Income", "income", null, "g"],
  ["4100", "Sales and Service Income", "income", "4000"],
  ["4900", "Other Income", "income", "4000"],
  ["5000", "Expenses", "expense", null, "g"],
  ["5100", "Rent", "expense", "5000"],
  ["5200", "Salaries and Wages", "expense", "5000"],
  ["5300", "Utilities", "expense", "5000"],
  ["5400", "Office Supplies", "expense", "5000"],
  ["5500", "Bank Fees", "expense", "5000"],
  ["5600", "Transport", "expense", "5000"],
  ["5900", "Other Expenses", "expense", "5000"],
];
const STARTER_BANKS: Array<[string, "bank" | "cash", string]> = [
  ["Cash on Hand", "cash", "1110"],
  ["Main Bank Account", "bank", "1120"],
  ["Savings Account", "bank", "1130"],
];

let setupPromise: Promise<void> | undefined;

/** Installs settings, the starter chart, bank/cash accounts and the current fiscal year once. */
export function ensureAccountingSetup(): Promise<void> {
  return (setupPromise ??= installStarter().catch((e) => {
    setupPromise = undefined;
    throw e;
  }));
}

async function installStarter() {
  const [existing] = await db.select({ id: accSettings.id }).from(accSettings);
  if (existing) return;
  await transaction(async (tx) => {
    const ids = new Map<string, string>();
    for (const [code, name, category, parent, flags = ""] of STARTER_CHART) {
      const [row] = await tx
        .insert(accAccounts)
        .values({
          code,
          name,
          category,
          parentId: parent ? ids.get(parent)! : null,
          isPosting: !flags.includes("g"),
          requiresParty: flags.includes("p"),
        })
        .returning({ id: accAccounts.id });
      ids.set(code, row.id);
    }
    for (const [name, kind, code] of STARTER_BANKS)
      await tx.insert(accBankAccounts).values({ name, kind, accountId: ids.get(code)! });
    await tx.insert(accSettings).values({ id: 1, retainedEarningsAccountId: ids.get("3300")! });
    const year = todayIso().slice(0, 4);
    await createFiscalYearTx(tx, { name: `FY ${year}`, startDate: `${year}-01-01` });
  });
}

/** Removes every accounting record and reinstalls the starter setup. Used by demo reset, restore and tests. */
export async function resetAccounting() {
  // TRUNCATE skips row triggers, which is the only sanctioned way to remove posted entries
  await db.execute(sql`TRUNCATE TABLE
    acc_recon_match_lines, acc_statement_lines, acc_statement_imports, acc_recon_matches,
    acc_reconciliations, acc_attachments, acc_lines, acc_entries, acc_periods, acc_fiscal_years,
    acc_bank_accounts, acc_settings, acc_parties, acc_accounts, acc_audit CASCADE`);
  setupPromise = undefined;
  await ensureAccountingSetup();
}

// ------------------------------------------------------------------- settings
export async function getSettings(tx: DbLike = db): Promise<AccSettings> {
  let [s] = await tx.select().from(accSettings);
  if (!s && tx === db) {
    await ensureAccountingSetup();
    [s] = await db.select().from(accSettings);
  }
  if (!s) throw new Error("Accounting is not set up yet.");
  return s;
}

export interface SettingsInput {
  businessName: string;
  currencyCode: string;
  currencyLabel: string;
  decimals: number;
  retainedEarningsAccountId: string;
}

export function updateSettings(input: SettingsInput) {
  return transaction(async (tx) => {
    const current = await getSettings(tx);
    const businessName = clean(input.businessName);
    const currencyCode = clean(input.currencyCode).toUpperCase();
    const currencyLabel = clean(input.currencyLabel);
    const decimals = Number(input.decimals);
    if (!businessName) fail("Business name is required.", "businessName");
    if (!currencyCode) fail("Currency code is required.", "currencyCode");
    if (!currencyLabel) fail("Display unit is required.", "currencyLabel");
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4)
      fail("Decimals must be between 0 and 4.", "decimals");

    const currencyChanged =
      currencyCode !== current.currencyCode ||
      currencyLabel !== current.currencyLabel ||
      decimals !== current.decimals;
    if (currencyChanged) {
      // Stored amounts are minor units of the current currency. Changing the unit or precision
      // after amounts exist would silently reinterpret them (e.g. rial vs toman), so it is refused.
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(accLines);
      const [{ s }] = await tx
        .select({ s: sql<number>`count(*)::int` })
        .from(accStatementLines);
      if (num(n) + num(s) > 0)
        fail(
          "The currency, display unit and precision are fixed once amounts have been recorded.",
          "currencyCode"
        );
    }
    const [re] = await tx
      .select()
      .from(accAccounts)
      .where(eq(accAccounts.id, input.retainedEarningsAccountId));
    if (!re || re.category !== "equity" || !re.isPosting)
      fail("Retained earnings must be an equity account that allows posting.", "retainedEarningsAccountId");

    await tx
      .update(accSettings)
      .set({
        businessName,
        currencyCode,
        currencyLabel,
        decimals,
        retainedEarningsAccountId: input.retainedEarningsAccountId,
      })
      .where(eq(accSettings.id, 1));
    await audit(tx, "settings.updated", "settings", null, "Updated accounting settings", {
      currencyCode,
      currencyLabel,
      decimals,
    });
  });
}

// ----------------------------------------------------- fiscal years & periods
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function createFiscalYearTx(tx: Tx, input: { name: string; startDate: string }) {
  const name = clean(input.name);
  if (!name) fail("Fiscal year name is required.", "name");
  if (!isIsoDate(input.startDate)) fail("Enter a valid start date.", "startDate");
  const endDate = addDays(addMonths(input.startDate, 12), -1);
  const overlap = await tx
    .select()
    .from(accFiscalYears)
    .where(and(lte(accFiscalYears.startDate, endDate), gte(accFiscalYears.endDate, input.startDate)));
  if (overlap.length) fail(`This range overlaps ${overlap[0].name}.`, "startDate");
  const [dupe] = await tx.select().from(accFiscalYears).where(eq(accFiscalYears.name, name));
  if (dupe) fail("A fiscal year with this name already exists.", "name");

  const [fy] = await tx
    .insert(accFiscalYears)
    .values({ name, startDate: input.startDate, endDate })
    .returning();
  // twelve monthly periods counted from the start date
  for (let i = 0; i < 12; i++) {
    const start = addMonths(input.startDate, i);
    const end = addDays(addMonths(input.startDate, i + 1), -1);
    const label = `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
    await tx.insert(accPeriods).values({
      fiscalYearId: fy.id,
      name: start.endsWith("-01") ? label : `${start} to ${end}`,
      startDate: start,
      endDate: end,
    });
  }
  await audit(tx, "fiscal_year.created", "fiscal_year", fy.id, `Created ${name} (${input.startDate} to ${endDate})`);
  return fy;
}

export const createFiscalYear = (input: { name: string; startDate: string }) =>
  transaction((tx) => createFiscalYearTx(tx, input));

export function deleteFiscalYear(id: string) {
  return transaction(async (tx) => {
    const [fy] = await tx.select().from(accFiscalYears).where(eq(accFiscalYears.id, id));
    if (!fy) fail("Fiscal year not found.");
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(accEntries)
      .where(and(gte(accEntries.date, fy.startDate), lte(accEntries.date, fy.endDate)));
    if (num(n) > 0) fail(`${fy.name} has journal entries and cannot be deleted.`);
    await tx.delete(accFiscalYears).where(eq(accFiscalYears.id, id));
    await audit(tx, "fiscal_year.deleted", "fiscal_year", id, `Deleted ${fy.name}`);
  });
}

export async function listFiscalYears(tx: DbLike = db) {
  const [years, periods] = await Promise.all([
    tx.select().from(accFiscalYears).orderBy(asc(accFiscalYears.startDate)),
    tx.select().from(accPeriods).orderBy(asc(accPeriods.startDate)),
  ]);
  return years.map((y) => ({ ...y, periods: periods.filter((p) => p.fiscalYearId === y.id) }));
}

export function lockPeriod(id: string) {
  return transaction(async (tx) => {
    const [p] = await tx
      .update(accPeriods)
      .set({ isLocked: true })
      .where(eq(accPeriods.id, id))
      .returning();
    if (!p) fail("Period not found.");
    await audit(tx, "period.locked", "period", id, `Locked period ${p.name}`);
  });
}

/** Reopening is explicit: it needs a reason and is written to the audit log. */
export async function reopenPeriod(id: string, reason: string) {
  const why = clean(reason);
  if (why.length < 3) fail("Give a reason for reopening this period.", "reason");
  return transaction(async (tx) => {
    const [p] = await tx.select().from(accPeriods).where(eq(accPeriods.id, id));
    if (!p) fail("Period not found.");
    const [fy] = await tx.select().from(accFiscalYears).where(eq(accFiscalYears.id, p.fiscalYearId));
    if (fy.isClosed)
      fail(`${fy.name} is closed. Reopen the fiscal year first; that reverses its closing entry.`);
    await tx.update(accPeriods).set({ isLocked: false }).where(eq(accPeriods.id, id));
    await audit(tx, "period.reopened", "period", id, `Reopened period ${p.name}`, { reason: why });
  });
}

// ---------------------------------------------------------- year-end closing
export interface ClosingPreview {
  fiscalYear: { id: string; name: string; startDate: string; endDate: string; isClosed: boolean };
  lines: Array<LineInput & { accountCode: string; accountName: string; partyName: string | null }>;
  income: number;
  expenses: number;
  netResult: number;
  retainedEarnings: { id: string; code: string; name: string } | null;
  blockers: string[];
}

/**
 * Builds the closing entry for a fiscal year: every income and expense balance up to the
 * year end is brought to zero and the net result goes to retained earnings.
 */
export async function previewClosing(fiscalYearId: string, tx: DbLike = db): Promise<ClosingPreview> {
  const [fy] = await tx.select().from(accFiscalYears).where(eq(accFiscalYears.id, fiscalYearId));
  if (!fy) fail("Fiscal year not found.");
  const settings = await getSettings(tx);
  const balances = (
    await tx.execute(sql`
      select l.account_id, l.party_id, a.code, a.name, a.category::text as category, p.name as party_name,
             sum(l.debit) - sum(l.credit) as balance
        from acc_lines l
        join acc_entries e on e.id = l.entry_id
        join acc_accounts a on a.id = l.account_id
        left join acc_parties p on p.id = l.party_id
       where e.status = 'posted' and e.date <= ${fy.endDate}
         and a.category in ('income', 'expense')
       group by l.account_id, l.party_id, a.code, a.name, a.category, p.name
      having sum(l.debit) - sum(l.credit) <> 0
       order by a.code`)
  ).rows as Array<Record<string, unknown>>;

  const lines: ClosingPreview["lines"] = [];
  let income = 0;
  let expenses = 0;
  let net = 0; // debit-positive total of the balances being closed
  for (const b of balances) {
    const balance = num(b.balance);
    net += balance;
    if (b.category === "income") income -= balance;
    else expenses += balance;
    lines.push({
      accountId: String(b.account_id),
      partyId: (b.party_id as string) ?? null,
      debit: balance < 0 ? -balance : 0,
      credit: balance > 0 ? balance : 0,
      accountCode: String(b.code),
      accountName: String(b.name),
      partyName: (b.party_name as string) ?? null,
    });
  }
  const [re] = settings.retainedEarningsAccountId
    ? await tx.select().from(accAccounts).where(eq(accAccounts.id, settings.retainedEarningsAccountId))
    : [];
  if (re && net !== 0)
    lines.push({
      accountId: re.id,
      partyId: null,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
      accountCode: re.code,
      accountName: re.name,
      partyName: null,
    });

  const blockers: string[] = [];
  if (fy.isClosed) blockers.push(`${fy.name} is already closed.`);
  if (!re) blockers.push("Choose a retained earnings account in Settings.");
  const [{ drafts }] = await tx
    .select({ drafts: sql<number>`count(*)::int` })
    .from(accEntries)
    .where(
      and(
        eq(accEntries.status, "draft"),
        gte(accEntries.date, fy.startDate),
        lte(accEntries.date, fy.endDate)
      )
    );
  if (num(drafts) > 0)
    blockers.push(`${drafts} draft entr${num(drafts) === 1 ? "y is" : "ies are"} dated in this year. Post or delete them first.`);
  const earlierOpen = await tx
    .select()
    .from(accFiscalYears)
    .where(and(eq(accFiscalYears.isClosed, false), lte(accFiscalYears.endDate, addDays(fy.startDate, -1))));
  if (earlierOpen.length) blockers.push(`Close ${earlierOpen[0].name} first.`);

  return {
    fiscalYear: fy,
    lines,
    income,
    expenses,
    netResult: income - expenses,
    retainedEarnings: re ? { id: re.id, code: re.code, name: re.name } : null,
    blockers,
  };
}

export function closeFiscalYear(fiscalYearId: string) {
  return transaction(async (tx) => {
    const preview = await previewClosing(fiscalYearId, tx);
    if (preview.blockers.length) fail(preview.blockers[0]);
    const fy = preview.fiscalYear;
    let closingEntryId: string | null = null;
    if (preview.lines.length) {
      // the last period must be open so the closing entry passes normal posting validation
      const posted = await createEntryTx(
        tx,
        {
          date: fy.endDate,
          description: `Year-end closing ${fy.name}`,
          kind: "closing",
          lines: preview.lines.map(({ accountId, partyId, debit, credit }) => ({
            accountId,
            partyId,
            debit,
            credit,
          })),
        },
        { post: true, allowInactive: true }
      );
      closingEntryId = posted.id;
    }
    await tx
      .update(accFiscalYears)
      .set({ isClosed: true, closingEntryId })
      .where(eq(accFiscalYears.id, fy.id));
    await tx.update(accPeriods).set({ isLocked: true }).where(eq(accPeriods.fiscalYearId, fy.id));
    await audit(tx, "fiscal_year.closed", "fiscal_year", fy.id, `Closed ${fy.name}`, {
      netResult: preview.netResult,
      closingEntryId,
    });
    return { closingEntryId };
  });
}

/** Undoes a year-end close: reverses the closing entry and unlocks the final period. Logged. */
export async function reopenFiscalYear(fiscalYearId: string, reason: string) {
  const why = clean(reason);
  if (why.length < 3) fail("Give a reason for reopening this fiscal year.", "reason");
  return transaction(async (tx) => {
    const [fy] = await tx.select().from(accFiscalYears).where(eq(accFiscalYears.id, fiscalYearId));
    if (!fy) fail("Fiscal year not found.");
    if (!fy.isClosed) fail(`${fy.name} is not closed.`);
    const later = await tx
      .select()
      .from(accFiscalYears)
      .where(and(eq(accFiscalYears.isClosed, true), gte(accFiscalYears.startDate, addDays(fy.endDate, 1))));
    if (later.length) fail(`Reopen ${later[later.length - 1].name} first.`);

    const periods = await tx
      .select()
      .from(accPeriods)
      .where(eq(accPeriods.fiscalYearId, fy.id))
      .orderBy(asc(accPeriods.startDate));
    const last = periods[periods.length - 1];
    await tx.update(accPeriods).set({ isLocked: false }).where(eq(accPeriods.id, last.id));
    if (fy.closingEntryId)
      await reverseEntryTx(tx, fy.closingEntryId, {
        date: fy.endDate,
        description: `Reopening ${fy.name}: reversal of year-end closing`,
        allowClosing: true,
      });
    await tx
      .update(accFiscalYears)
      .set({ isClosed: false, closingEntryId: null })
      .where(eq(accFiscalYears.id, fy.id));
    await audit(tx, "fiscal_year.reopened", "fiscal_year", fy.id, `Reopened ${fy.name}`, {
      reason: why,
      unlockedPeriod: last.name,
    });
  });
}

export async function accountIdsByCode(codes: string[], tx: DbLike = db) {
  const rows = await tx.select().from(accAccounts).where(inArray(accAccounts.code, codes));
  return Object.fromEntries(rows.map((r) => [r.code, r.id])) as Record<string, string>;
}
