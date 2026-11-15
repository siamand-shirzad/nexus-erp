import { readFile } from "node:fs/promises";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runMigrations } from "@/db/migrate";
import { accEntries, accFiscalYears, accPeriods, accStatementLines } from "@/db/accounting-schema";
import { AccError } from "@/lib/accounting/core";
import { formatAmount, parseAmount } from "@/lib/accounting/money";
import {
  createEntry,
  deleteDraft,
  postEntry,
  reverseEntry,
  updateDraft,
  getEntry,
  listEntries,
} from "@/lib/accounting/journal";
import { deleteAccount, listAccounts, listBankAccounts, saveAccount, saveParty } from "@/lib/accounting/masterdata";
import { quickTransaction } from "@/lib/accounting/quick";
import {
  balanceSheet,
  cashMovements,
  dashboard,
  incomeStatement,
  ledger,
  partyBalances,
  trialBalance,
} from "@/lib/accounting/reports";
import {
  commitImport,
  completeReconciliation,
  confirmMatch,
  createAdjustment,
  previewImport,
  reconWorkspace,
  suggestMatches,
  unmatch,
} from "@/lib/accounting/recon";
import {
  accountIdsByCode,
  closeFiscalYear,
  createFiscalYear,
  lockPeriod,
  previewClosing,
  reopenFiscalYear,
  reopenPeriod,
  resetAccounting,
} from "@/lib/accounting/setup";
import { createBackup, restoreBackup, validateBackup } from "@/lib/accounting/backup";
import { DEMO_STATEMENT_MAPPING, loadDemo } from "@/lib/accounting/demo";
import type { StatementMapping } from "@/lib/accounting/statement";

let a: Record<string, string>; // account ids by code
let mainBank: string;
let savingsBank: string;

const csv = (text: string) => new TextEncoder().encode(text);
const SIGNED: StatementMapping = {
  date: 0,
  description: 1,
  reference: null,
  externalId: null,
  balance: null,
  amountMode: "signed",
  amount: 2,
  positiveMeans: "deposit",
  dateFormat: "YMD",
};
const post = (date: string, lines: Array<[string, number, number, string?]>, description = "Test entry") =>
  createEntry(
    { date, description, lines: lines.map(([code, debit, credit, partyId]) => ({ accountId: a[code], debit, credit, partyId })) },
    { post: true }
  );
const rejects = async (p: Promise<unknown>, pattern: RegExp) => {
  // drizzle wraps database errors; the trigger message is on the cause
  const error = await p.then(() => null, (e) => e);
  expect(error, "expected a rejection").toBeTruthy();
  expect(String(error.message) + " " + String(error.cause?.message ?? "")).toMatch(pattern);
};

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await resetAccounting();
  const has2026 = await db
    .select()
    .from(accFiscalYears)
    .where(sql`${accFiscalYears.startDate} <= '2026-01-01' and ${accFiscalYears.endDate} >= '2026-12-31'`);
  if (!has2026.length) await createFiscalYear({ name: "FY 2026 test", startDate: "2026-01-01" });
  a = await accountIdsByCode(["1000", "1100", "1110", "1120", "1130", "1200", "2100", "3100", "3300", "3900", "4100", "5100", "5500"]);
  const banks = await listBankAccounts();
  mainBank = banks.find((b) => b.accountId === a["1120"])!.id;
  savingsBank = banks.find((b) => b.accountId === a["1130"])!.id;
});

describe("money", () => {
  it("parses and formats exactly, without floating point", () => {
    expect(parseAmount("1,234,500", 0)).toBe(1234500);
    expect(parseAmount("0.10", 2)! + parseAmount("0.20", 2)!).toBe(30); // 0.1 + 0.2 === 0.3 exactly
    expect(parseAmount("(350.5)", 2)).toBe(-35050);
    expect(parseAmount("12.345", 2)).toBeNull(); // more precision than the currency has
    expect(parseAmount("1,23", 0)).toBeNull();
    expect(parseAmount("abc", 0)).toBeNull();
    expect(parseAmount("۱۲۳", 0)).toBe(123);
    expect(formatAmount(123456789, 2)).toBe("1,234,567.89");
    expect(formatAmount(-5, 2)).toBe("-0.05");
    expect(formatAmount(424650000, 0)).toBe("424,650,000");
  });
});

describe("journal entry validation", () => {
  it("rejects unbalanced and malformed entries", async () => {
    await rejects(post("2026-02-01", [["1120", 100, 0], ["4100", 0, 90]]), /debits must equal/i);
    await rejects(post("2026-02-01", [["1120", 100, 0]]), /at least two lines/i);
    await rejects(post("2026-02-01", [["1120", 100, 100], ["4100", 0, 0]]), /either a debit or a credit/i);
    await rejects(post("2026-02-01", [["1120", 0, 0], ["4100", 0, 0]]), /debit or a credit amount/i);
    await rejects(post("2026-02-01", [["1120", 1.5, 0], ["4100", 0, 1.5]]), /whole minor units/i);
    await rejects(post("2026-02-01", [["1100", 100, 0], ["4100", 0, 100]]), /summary account/i);
    await rejects(post("2026-02-01", [["1200", 100, 0], ["4100", 0, 100]]), /needs a party/i);
    await rejects(post("1999-02-01", [["1120", 100, 0], ["4100", 0, 100]]), /no accounting period/i);
    await rejects(post("2026-02-01", [["1120", 100, 0], ["4100", 0, 100]], "  "), /description is required/i);
    expect((await trialBalance({})).rows).toHaveLength(0); // nothing was saved by the failed attempts
  });

  it("rejects inactive accounts", async () => {
    const rent = (await listAccounts()).find((x) => x.code === "5100")!;
    await saveAccount({ ...rent, isActive: false }, rent.id);
    await rejects(post("2026-02-01", [["5100", 100, 0], ["1120", 0, 100]]), /inactive/i);
  });

  it("is enforced by the database as well as the application", async () => {
    const draft = await createEntry({
      date: "2026-02-01",
      description: "Unbalanced draft",
      lines: [
        { accountId: a["1120"], debit: 100, credit: 0 },
        { accountId: a["4100"], debit: 0, credit: 60 },
      ],
    });
    await rejects(
      db.execute(sql`update acc_entries set status = 'posted', seq = 999, entry_number = 'X-1' where id = ${draft.id}`),
      /not balanced/i
    );
    const ok = await post("2026-02-01", [["1120", 100, 0], ["4100", 0, 100]]);
    await rejects(db.execute(sql`delete from acc_entries where id = ${ok.id}`), /cannot be deleted/i);
    await rejects(db.execute(sql`update acc_lines set debit = 5 where entry_id = ${ok.id} and debit > 0`), /cannot be changed/i);
    await rejects(db.execute(sql`update acc_entries set date = '2026-03-01' where id = ${ok.id}`), /cannot be edited/i);
  });

  it("returns the first result when the same submission arrives twice", async () => {
    const input = {
      date: "2026-02-01",
      description: "Double click",
      idempotencyKey: "key-1",
      lines: [
        { accountId: a["1120"], debit: 100, credit: 0 },
        { accountId: a["4100"], debit: 0, credit: 100 },
      ],
    };
    const first = await createEntry(input, { post: true });
    const second = await createEntry(input, { post: true });
    expect(second.id).toBe(first.id);
    expect(second.duplicate).toBe(true);
    expect((await incomeStatement({})).income.total).toBe(100);
  });
});

describe("drafts, posting, reversals and locked periods", () => {
  it("keeps drafts out of every report", async () => {
    const draft = await createEntry({
      date: "2026-02-01",
      description: "Draft sale",
      lines: [
        { accountId: a["1120"], debit: 500, credit: 0 },
        { accountId: a["4100"], debit: 0, credit: 500 },
      ],
    });
    expect((await trialBalance({})).rows).toHaveLength(0);
    expect((await incomeStatement({})).netResult).toBe(0);
    expect((await ledger({ accountId: a["1120"] })).rows).toHaveLength(0);
    expect((await dashboard({})).drafts).toHaveLength(1);
    const listed = await listEntries({ q: "draft sale", status: "draft" });
    expect(listed.map((e) => [Number(e.total), Number(e.lineCount)])).toEqual([[500, 2]]);
    expect(await listEntries({ q: "1120" })).toHaveLength(1); // search reaches account codes on the lines
    expect(await listEntries({ q: "no such text" })).toHaveLength(0);
    await postEntry(draft.id);
    expect((await incomeStatement({})).netResult).toBe(500);
  });

  it("does not edit or delete posted entries; reversal nets to zero and keeps both", async () => {
    const e = await post("2026-02-01", [["1120", 700, 0], ["4100", 0, 700]]);
    await rejects(deleteDraft(e.id), /cannot be deleted/i);
    await rejects(
      updateDraft(e.id, { date: "2026-02-02", description: "x", lines: [] }),
      /cannot be edited/i
    );
    const r = await reverseEntry(e.id, { date: "2026-02-10" });
    const original = (await getEntry(e.id))!;
    expect(original.status).toBe("posted");
    expect(original.reversedBy?.id).toBe(r.id);
    expect((await getEntry(r.id))!.reverses?.id).toBe(e.id);
    expect(original.history.map((h) => h.action)).toContain("entry.reversed");

    const bank = await ledger({ accountId: a["1120"] });
    expect(bank.rows).toHaveLength(2); // both stay visible
    expect(bank.closing).toBe(0);
    expect((await incomeStatement({})).netResult).toBe(0);
    await rejects(reverseEntry(e.id, { date: "2026-02-11" }), /already been reversed/i);
  });

  it("blocks posting and reversing in locked periods; reopening is explicit and logged", async () => {
    const e = await post("2026-03-05", [["1120", 100, 0], ["4100", 0, 100]]);
    const [march] = await db.select().from(accPeriods).where(eq(accPeriods.startDate, "2026-03-01"));
    await lockPeriod(march.id);
    await rejects(post("2026-03-10", [["1120", 100, 0], ["4100", 0, 100]]), /locked/i);
    await rejects(reverseEntry(e.id, { date: "2026-03-20" }), /locked/i);
    await reverseEntry(e.id, { date: "2026-04-01" }); // an open-period date works
    await rejects(reopenPeriod(march.id, ""), /reason/i);
    await reopenPeriod(march.id, "Correction requested by the accountant");
    await post("2026-03-10", [["1120", 100, 0], ["4100", 0, 100]]);
    const log = (await db.execute(sql`select action from acc_audit where entity_id = ${march.id}`)).rows;
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["period.locked", "period.reopened"]));
  });
});

describe("ledgers and party balances", () => {
  it("computes opening, running and closing balances in a stable order", async () => {
    await post("2026-01-10", [["1120", 1000, 0], ["3100", 0, 1000]]);
    await post("2026-02-05", [["5100", 300, 0], ["1120", 0, 300]], "Rent");
    await post("2026-02-05", [["1120", 50, 0], ["4100", 0, 50]], "Sale"); // same date: posting order decides
    await post("2026-03-01", [["5500", 20, 0], ["1120", 0, 20]]);

    const l = await ledger({ accountId: a["1120"], from: "2026-02-01", to: "2026-02-28" });
    expect(l.opening).toBe(1000);
    expect(l.rows.map((r) => r.balance)).toEqual([700, 750]);
    expect(l.rows.map((r) => r.description)).toEqual(["Rent", "Sale"]);
    expect([l.totalDebit, l.totalCredit, l.closing]).toEqual([50, 300, 750]);

    // a parent account aggregates its descendants once
    const parent = await ledger({ accountId: a["1000"], to: "2026-12-31" });
    expect(parent.closing).toBe(730);
    // a text filter hides rows but keeps true running balances
    const filtered = await ledger({ accountId: a["1120"], description: "sale" });
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0].balance).toBe(750);
    expect(filtered.closing).toBe(730);
  });

  it("tracks receivables and payables per party separately", async () => {
    const both = await saveParty({ name: "Both Ways Ltd", isCustomer: true, isSupplier: true });
    const cust = await saveParty({ name: "Customer Only", isCustomer: true });
    await post("2026-01-05", [["1200", 1000, 0, both], ["4100", 0, 1000]]);
    await post("2026-01-06", [["5100", 400, 0], ["2100", 0, 400, both]]);
    await post("2026-01-07", [["1200", 250, 0, cust], ["4100", 0, 250]]);
    await quickTransaction({ type: "receipt", date: "2026-01-20", amount: 600, bankAccountId: mainBank, counterAccountId: a["1200"], partyId: both });
    await quickTransaction({ type: "payment", date: "2026-01-21", amount: 100, bankAccountId: mainBank, counterAccountId: a["2100"], partyId: both });

    const balances = await partyBalances();
    const b = balances.find((p) => p.partyId === both)!;
    expect([b.receivable, b.payable]).toEqual([400, 300]); // never netted into one figure
    expect(balances.find((p) => p.partyId === cust)!.receivable).toBe(250);

    const statement = await ledger({ partyId: both, from: "2026-01-06" });
    expect(statement.opening).toBe(1000);
    expect(statement.rows).toHaveLength(3);
    // collecting a receivable is not income; paying a payable is not an expense
    const pl = await incomeStatement({});
    expect([pl.income.total, pl.expenses.total]).toEqual([1250, 400]);
    const d = await dashboard({});
    expect([d.receivables, d.payables]).toEqual([650, 300]);
  });
});

describe("bank transfers", () => {
  it("move two asset accounts and are not income, expense, receipts or payments", async () => {
    await post("2026-01-02", [["1120", 5000, 0], ["3100", 0, 5000]]);
    const t = await quickTransaction({ type: "transfer", date: "2026-01-15", amount: 2000, bankAccountId: mainBank, toBankAccountId: savingsBank });
    const entry = (await getEntry(t.id))!;
    expect(entry.lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ["1130", 2000, 0],
      ["1120", 0, 2000],
    ]);
    const pl = await incomeStatement({});
    expect([pl.income.total, pl.expenses.total]).toEqual([0, 0]);
    const cash = await cashMovements({ from: "2026-01-10", to: "2026-01-31" });
    expect([cash.receipts, cash.payments]).toEqual([0, 0]);
    const main = cash.rows.find((r) => r.bankAccountId === mainBank)!;
    expect([main.opening, main.transfersOut, main.closing]).toEqual([5000, 2000, 3000]);
    expect(cash.rows.find((r) => r.bankAccountId === savingsBank)!.transfersIn).toBe(2000);
    await rejects(
      quickTransaction({ type: "transfer", date: "2026-01-15", amount: 1, bankAccountId: mainBank, toBankAccountId: mainBank }),
      /different accounts/i
    );
    await rejects(
      quickTransaction({ type: "receipt", date: "2026-01-15", amount: 1, bankAccountId: mainBank, counterAccountId: a["1130"] }),
      /use transfer/i
    );
  });
});

describe("trial balance and balance sheet", () => {
  it("balance, and the balance sheet carries current-period earnings", async () => {
    const p = await saveParty({ name: "Customer" });
    await post("2026-01-01", [["1120", 10000, 0], ["3100", 0, 10000]]);
    await post("2026-01-10", [["1200", 4000, 0, p], ["4100", 0, 4000]]);
    await post("2026-01-15", [["5100", 1500, 0], ["1120", 0, 1500]]);
    await post("2026-01-20", [["5500", 25, 0], ["2100", 0, 25, p]]);

    const tb = await trialBalance({ to: "2026-12-31" });
    expect(tb.balanced).toBe(true);
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    // the parent row equals the sum of its leaves, and totals are not double-counted
    expect(tb.rows.find((r) => r.code === "1000")!.closing).toBe(12500);
    expect(tb.totals.closingDebit).toBe(8500 + 4000 + 1500 + 25);

    const pl = await incomeStatement({ from: "2026-01-01", to: "2026-12-31" });
    expect(pl.netResult).toBe(2475);
    const bs = await balanceSheet("2026-12-31");
    expect(bs.currentEarnings).toBe(2475);
    expect(bs.assets.total).toBe(12500);
    expect(bs.totalLiabilitiesAndEquity).toBe(12500);
    expect(bs.balanced).toBe(true);
    // an earlier cutoff uses the same boundaries
    expect((await balanceSheet("2026-01-12")).currentEarnings).toBe(4000);
  });
});

describe("account hierarchy rules", () => {
  it("prevents cycles, deleting used accounts and unsafe changes", async () => {
    await post("2026-01-01", [["1120", 100, 0], ["3100", 0, 100]]);
    const all = await listAccounts();
    const assets = all.find((x) => x.code === "1000")!;
    const cashBank = all.find((x) => x.code === "1100")!;
    const main = all.find((x) => x.code === "1120")!;
    await rejects(saveAccount({ ...assets, parentId: cashBank.id }, assets.id), /under itself/i);
    await rejects(deleteAccount(main.id), /deactivate it instead/i);
    await rejects(saveAccount({ ...main, category: "expense", parentId: null }, main.id), /category cannot change/i);
    await rejects(saveAccount({ ...main, isPosting: false }, main.id), /posting must stay allowed/i);
    await rejects(saveAccount({ code: "1121", name: "Sub", category: "asset", parentId: main.id }), /cannot become a parent/i);
    await rejects(saveAccount({ code: "1120", name: "Dupe", category: "asset" }), /already in use/i);
    await rejects(saveAccount({ code: "5999", name: "Wrong", category: "expense", parentId: assets.id }), /same category/i);
    const id = await saveAccount({ code: "1140", name: "Petty cash", category: "asset", parentId: cashBank.id });
    await deleteAccount(id);
  });
});

describe("statement import", () => {
  const file = csv("Date,Description,Amount\n2026-01-05,Card payment,-500\n2026-01-06,Deposit,1200\n");

  it("never creates journal entries and rejects re-importing the same file", async () => {
    const r = await commitImport(mainBank, "jan.csv", file, SIGNED);
    expect(r.imported).toBe(2);
    expect(await db.select().from(accEntries)).toHaveLength(0);
    await rejects(commitImport(mainBank, "renamed.csv", file, SIGNED), /already been imported/i);
  });

  it("skips known bank transaction ids, and flags look-alikes without discarding them", async () => {
    const withIds: StatementMapping = { ...SIGNED, externalId: 3 };
    await commitImport(mainBank, "a.csv", csv("Date,Description,Amount,Id\n2026-01-05,Fee,-10,T1\n2026-01-06,Fee,-10,T2\n"), withIds);
    // overlapping export: T2 again plus a new T3 with the same date and amount as T2
    const overlap = csv("Date,Description,Amount,Id\n2026-01-06,Fee,-10,T2\n2026-01-06,Fee,-10,T3\n");
    const preview = await previewImport(mainBank, "b.csv", overlap, withIds);
    expect(preview.alreadyImported.map((x) => x.externalId)).toEqual(["T2"]);
    expect(preview.rows.map((x) => x.externalId)).toEqual(["T3"]);
    const r = await commitImport(mainBank, "b.csv", overlap, withIds);
    expect([r.imported, r.skipped]).toEqual([1, 1]);

    // no identifiers: two legitimate same-day same-amount rows are both kept ...
    await commitImport(savingsBank, "c.csv", csv("Date,Description,Amount\n2026-01-05,Coffee,-30\n2026-01-05,Coffee,-30\n"), SIGNED);
    // ... and a later file repeating one is imported but flagged for review
    const again = await commitImport(savingsBank, "d.csv", csv("Date,Description,Amount\n2026-01-05,Coffee,-30\n2026-01-07,Lunch,-80\n"), SIGNED);
    expect([again.imported, again.flagged]).toEqual([2, 1]);
    const lines = await db.select().from(accStatementLines).where(eq(accStatementLines.bankAccountId, savingsBank));
    expect(lines).toHaveLength(4);
    expect(lines.filter((l) => l.duplicateFlag)).toHaveLength(1);
  });

  it("reads the XLSX sample with a signed amount column and day-first dates", async () => {
    const bytes = await readFile("samples/savings-statement-january.xlsx");
    const mapping: StatementMapping = { ...SIGNED, balance: 3, dateFormat: "DMY" };
    const preview = await previewImport(savingsBank, "savings.xlsx", bytes, mapping);
    expect(preview.errors).toHaveLength(0);
    expect(preview.rows.map((r) => [r.date, r.amount, r.runningBalance])).toEqual([
      ["2026-01-20", 100_000_000, 100_000_000],
      ["2026-01-31", 410_000, 100_410_000],
    ]);
    // the same file read as month-first is rejected instead of silently reinterpreted
    expect((await previewImport(savingsBank, "savings.xlsx", bytes, { ...mapping, dateFormat: "MDY" })).errors).toHaveLength(2);
  });

  it("reports invalid rows and imports nothing until they are fixed", async () => {
    const bad = csv("Date,Description,Amount\n2026-01-05,Ok,-10\n05/01/2026,Wrong date format,-10\n2026-01-07,Bad amount,12x\n,,\n");
    const preview = await previewImport(mainBank, "bad.csv", bad, SIGNED);
    expect(preview.errors.map((e) => e.rowNo)).toEqual([3, 4]);
    expect(preview.blank).toBe(1);
    await rejects(commitImport(mainBank, "bad.csv", bad, SIGNED), /2 row\(s\) are invalid/i);
    expect(await db.select().from(accStatementLines)).toHaveLength(0);
  });

  it("applies the chosen date format and sign convention instead of guessing", async () => {
    const f = csv("Date,Description,Amount\n03/04/2026,Ambiguous day and month,250\n");
    const dmy = await previewImport(mainBank, "f.csv", f, { ...SIGNED, dateFormat: "DMY" });
    const mdy = await previewImport(mainBank, "f.csv", f, { ...SIGNED, dateFormat: "MDY", positiveMeans: "withdrawal" });
    expect([dmy.rows[0].date, dmy.rows[0].amount]).toEqual(["2026-04-03", 250]);
    expect([mdy.rows[0].date, mdy.rows[0].amount]).toEqual(["2026-03-04", -250]);
    expect((await previewImport(mainBank, "f.csv", f, SIGNED)).errors).toHaveLength(1);
  });
});

describe("reconciliation matching", () => {
  const s = (id: string, date: string, amount: number, reference: string | null = null, description = "") => ({ id, date, amount, reference, description });

  it("does not finalise ambiguous matches just because amounts are equal", () => {
    const out = suggestMatches(
      [s("s1", "2026-01-23", -500), s("s2", "2026-01-24", -500), s("s3", "2026-01-25", -900, "PAY-7")],
      [s("b1", "2026-01-22", -500), s("b2", "2026-01-23", -500), s("b3", "2026-01-25", -900, "PAY-7"), s("b4", "2026-01-25", -900)]
    );
    expect(out.suggested).toEqual([{ statementId: "s3", bookId: "b3", reasons: expect.arrayContaining(["reference matches"]) }]);
    expect(out.ambiguous.map((x) => x.statementId).sort()).toEqual(["s1", "s2"]);
    // one book line, two statement lines of that amount: neither is suggested
    const two = suggestMatches([s("s1", "2026-01-23", -500), s("s2", "2026-01-24", -500)], [s("b1", "2026-01-23", -500)]);
    expect(two.suggested).toHaveLength(0);
    expect(two.ambiguous).toHaveLength(2);
    // same reference but different amount is reported, not matched
    const diff = suggestMatches([s("s1", "2026-01-23", -510, "INV-9")], [s("b1", "2026-01-23", -500, "INV-9")]);
    expect(diff.suggested).toHaveLength(0);
    expect(diff.amountDifferences).toEqual([{ statementId: "s1", bookId: "b1", difference: -10 }]);
  });

  async function bankLineIds() {
    return (
      await db.execute(sql`select l.id, l.debit - l.credit as amount from acc_lines l join acc_entries e on e.id = l.entry_id
                            where l.account_id = ${a["1120"]} order by e.seq, l.line_no`)
    ).rows.map((r) => ({ id: String(r.id), amount: Number(r.amount) }));
  }
  const stmtIds = async () =>
    (await db.select().from(accStatementLines).orderBy(accStatementLines.lineNo)).map((l) => l.id);

  it("requires exact totals and never reuses a transaction", async () => {
    await post("2026-01-05", [["1120", 300, 0], ["4100", 0, 300]]);
    await post("2026-01-06", [["1120", 300, 0], ["4100", 0, 300]]);
    await commitImport(mainBank, "s.csv", csv("Date,Description,Amount\n2026-01-05,Dep,300\n2026-01-06,Dep,300\n2026-01-07,Dep,250\n"), SIGNED);
    const [b1, b2] = await bankLineIds();
    const [s1, s2, s3] = await stmtIds();
    await rejects(confirmMatch(mainBank, [s3], [b1.id]), /totals do not agree/i);
    const m = await confirmMatch(mainBank, [s1], [b1.id]);
    await rejects(confirmMatch(mainBank, [s1], [b2.id]), /already matched/i);
    await rejects(confirmMatch(mainBank, [s2], [b1.id]), /already matched/i);
    await rejects(confirmMatch(savingsBank, [s2], [b2.id]), /does not belong/i);
    await unmatch(m);
    await confirmMatch(mainBank, [s1], [b1.id]); // free again after unmatching
  });

  it("supports one-to-many and many-to-one groups", async () => {
    await post("2026-01-05", [["1120", 100, 0], ["4100", 0, 100]]);
    await post("2026-01-05", [["1120", 150, 0], ["4100", 0, 150]]);
    await post("2026-01-08", [["1120", 900, 0], ["4100", 0, 900]]);
    await commitImport(mainBank, "s.csv", csv("Date,Description,Amount\n2026-01-06,Batch deposit,250\n2026-01-08,Part 1,400\n2026-01-09,Part 2,500\n"), SIGNED);
    const [b1, b2, b3] = await bankLineIds();
    const [s1, s2, s3] = await stmtIds();
    await confirmMatch(mainBank, [s1], [b1.id, b2.id]); // one statement line, two book lines
    await rejects(confirmMatch(mainBank, [s2], [b3.id]), /totals do not agree/i);
    await confirmMatch(mainBank, [s2, s3], [b3.id]); // two statement lines, one book line
    const ws = await reconWorkspace(mainBank, "2026-01-31", 1150);
    expect(ws.confirmed).toHaveLength(2);
    expect(ws.outstandingBook).toHaveLength(0);
    expect(ws.unrecordedStatement).toHaveLength(0);
    expect(ws.report.difference).toBe(0);
  });
});

describe("demo dataset, reconciliation report, backup and restore", () => {
  it("reconciles the demo bank account end to end", async () => {
    await loadDemo();
    const tb = await trialBalance({});
    expect(tb.balanced).toBe(true);
    const parties = await partyBalances();
    expect(parties.find((p) => p.name === "Alborz Trading")!.receivable).toBe(50_000_000); // 80 + 120 - 150
    // opening balances are starting positions, not receipts; the transfer is not a payment
    const cash = await cashMovements({ from: "2026-01-01", to: "2026-01-31" });
    expect([cash.receipts, cash.payments]).toEqual([150_000_000, 150_000_000]);
    expect(cash.rows.every((r) => r.closing === r.opening + r.receipts - r.payments + r.transfersIn - r.transfersOut)).toBe(true);
    expect(parties.find((p) => p.name === "Pars Supplies")!.payable).toBe(35_000_000); // 60 + 45 - 70

    let ws = await reconWorkspace(mainBank, "2026-01-31", 424_650_000);
    expect(ws.report.bookBalance).toBe(400_000_000);
    // opening balance plus four referenced items are suggested; the two POS lines are not
    expect(ws.suggestions.suggested).toHaveLength(5);
    expect(ws.suggestions.ambiguous).toHaveLength(2);
    expect(ws.report.difference).toBe(0); // every remaining item is listed and explained
    await rejects(
      completeReconciliation({ bankAccountId: mainBank, cutoff: "2026-01-31", closingBalance: 424_650_000 }),
      /not in the books/i
    );
    await rejects(
      completeReconciliation({ bankAccountId: mainBank, cutoff: "2026-01-31", closingBalance: 424_000_000, acceptUnrecorded: true }),
      /unexplained difference/i
    );

    for (const sgt of ws.suggestions.suggested) await confirmMatch(mainBank, [sgt.statementId], [sgt.bookId]);
    // the user decides the ambiguous pair
    const [x, y] = ws.suggestions.ambiguous;
    await confirmMatch(mainBank, [x.statementId], [x.candidateBookIds[0]]);
    await confirmMatch(mainBank, [y.statementId], [y.candidateBookIds[1]]);

    ws = await reconWorkspace(mainBank, "2026-01-31", 424_650_000);
    expect(ws.unrecordedStatement.map((l) => l.description)).toEqual(["Monthly account fee"]);
    expect(ws.outstandingBook.map((l) => l.reference)).toEqual(["CHQ-3003"]);

    const fee = ws.unrecordedStatement[0];
    await rejects(
      createAdjustment({ statementLineId: fee.id, counterAccountId: a["5500"], description: "Bank fee", approved: false }),
      /approve/i
    );
    await createAdjustment({ statementLineId: fee.id, counterAccountId: a["5500"], description: "Bank fee", approved: true });

    ws = await reconWorkspace(mainBank, "2026-01-31", 424_650_000);
    expect(ws.report).toMatchObject({
      bookBalance: 399_650_000,
      outstandingBookTotal: -25_000_000,
      unrecordedStatementTotal: 0,
      adjustedStatementBalance: 399_650_000,
      adjustedBookBalance: 399_650_000,
      difference: 0,
      adjustmentsTotal: -350_000,
    });
    const id = await completeReconciliation({ bankAccountId: mainBank, cutoff: "2026-01-31", closingBalance: 424_650_000 });
    expect(id).toBeTruthy();
    await rejects(unmatch(ws.confirmed[0].id), /completed reconciliation/i);
    expect((await dashboard({})).unmatched.count).toBe(0);
  });

  it("restores a backup exactly, and refuses a damaged one without touching data", async () => {
    await loadDemo();
    const before = await trialBalance({});
    const backup = JSON.parse(JSON.stringify(await createBackup()));
    expect(validateBackup(backup).entries).toBeGreaterThan(5);

    const damaged = JSON.parse(JSON.stringify(backup));
    damaged.tables.lines[0].debit += 1;
    await rejects(restoreBackup(damaged), /checksum/i);
    await rejects(restoreBackup({ format: "something-else" }), /not an accounting backup/i);
    expect((await trialBalance({})).totals).toEqual(before.totals); // untouched

    await resetAccounting(); // a disposable, empty set of books
    expect((await trialBalance({})).rows).toHaveLength(0);
    await restoreBackup(backup);
    const after = await trialBalance({});
    expect(after.rows).toEqual(before.rows);
    expect(after.balanced).toBe(true);
    expect(await db.select().from(accStatementLines)).toHaveLength(backup.tables.statementLines.length);
    // restored posted entries are still protected
    const [posted] = await db.select().from(accEntries).where(eq(accEntries.status, "posted")).limit(1);
    await rejects(db.execute(sql`delete from acc_entries where id = ${posted.id}`), /cannot be deleted/i);
  });
});

describe("year-end closing", () => {
  it("closes into retained earnings once, without duplicate effects", async () => {
    await post("2026-01-01", [["1120", 10000, 0], ["3100", 0, 10000]]);
    await post("2026-06-01", [["1120", 6000, 0], ["4100", 0, 6000]]);
    await post("2026-07-01", [["5100", 2500, 0], ["1120", 0, 2500]]);
    const [fy] = await db.select().from(accFiscalYears).where(sql`${accFiscalYears.startDate} = '2026-01-01'`);

    const preview = await previewClosing(fy.id);
    expect(preview.netResult).toBe(3500);
    expect(preview.lines.find((l) => l.accountCode === "3300")).toMatchObject({ debit: 0, credit: 3500 });
    const totalBefore = (await balanceSheet("2026-12-31")).totalEquity;

    await closeFiscalYear(fy.id);
    await rejects(closeFiscalYear(fy.id), /already closed/i);
    await rejects(post("2026-08-01", [["1120", 1, 0], ["4100", 0, 1]]), /locked/i);

    const bs = await balanceSheet("2026-12-31");
    expect(bs.balanced).toBe(true);
    expect(bs.currentEarnings).toBe(0); // moved, not counted twice
    expect(bs.equity.rows.find((r) => r.code === "3300")!.amount).toBe(3500);
    expect(bs.totalEquity).toBe(totalBefore);
    // the closed year still reports its operating result
    expect((await incomeStatement({ from: "2026-01-01", to: "2026-12-31" })).netResult).toBe(3500);
    expect((await trialBalance({})).balanced).toBe(true);

    await rejects(reopenFiscalYear(fy.id, ""), /reason/i);
    await reopenFiscalYear(fy.id, "Late supplier bill");
    expect((await balanceSheet("2026-12-31")).currentEarnings).toBe(3500);
    await post("2026-12-31", [["5500", 500, 0], ["1120", 0, 500]]);
    await closeFiscalYear(fy.id);
    const final = await balanceSheet("2026-12-31");
    expect(final.equity.rows.find((r) => r.code === "3300")!.amount).toBe(3000);
    expect([final.currentEarnings, final.balanced]).toEqual([0, true]);
    expect((await incomeStatement({ from: "2026-01-01", to: "2026-12-31" })).netResult).toBe(3000);
  });
});

it("AccError carries field-level issues for forms", async () => {
  try {
    await post("2026-02-01", [["1200", 100, 0], ["4100", 0, 90]]);
    throw new Error("should have failed");
  } catch (e) {
    expect(e).toBeInstanceOf(AccError);
    expect((e as AccError).issues.map((i) => i.field)).toEqual(expect.arrayContaining(["lines.0.partyId", "lines"]));
  }
});
