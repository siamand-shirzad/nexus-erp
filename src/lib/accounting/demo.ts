import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accSettings, accFiscalYears } from "@/db/accounting-schema";
import { audit, fail, num } from "./core";
import { createEntry } from "./journal";
import { listBankAccounts, saveParty } from "./masterdata";
import { quickTransaction } from "./quick";
import { commitImport } from "./recon";
import { accountIdsByCode, createFiscalYear, getSettings, resetAccounting } from "./setup";
import type { StatementMapping } from "./statement";

// The demo dataset is fictional and lives in its own set of books: it can only be loaded
// into empty books, marks them as DEMO (a banner is shown everywhere), and is removed as a whole.

export const DEMO_STATEMENT_MAPPING: StatementMapping = {
  date: 0,
  description: 1,
  reference: 2,
  externalId: 3,
  amountMode: "split",
  withdrawal: 4,
  deposit: 5,
  balance: 6,
  dateFormat: "YMD",
};

export async function loadDemo() {
  const settings = await getSettings();
  const [{ n }] = (
    await db.execute(sql`select
      (select count(*) from acc_entries) + (select count(*) from acc_parties) +
      (select count(*) from acc_statement_lines) as n`)
  ).rows as Array<{ n: unknown }>;
  if (num(n) > 0)
    fail("Demo data can only be loaded into empty books, so it never mixes with real records.");
  if (settings.decimals !== 0)
    fail("The demo dataset uses a currency without decimals. Set decimals to 0 first.");

  const covering = await db
    .select()
    .from(accFiscalYears)
    .where(sql`${accFiscalYears.startDate} <= '2026-01-01' and ${accFiscalYears.endDate} >= '2026-01-31'`);
  if (!covering.length) await createFiscalYear({ name: "FY 2026 (demo)", startDate: "2026-01-01" });

  await db
    .update(accSettings)
    .set({ isDemo: true, businessName: "Demo Trading Co." })
    .where(eq(accSettings.id, 1));

  const a = await accountIdsByCode(["1110", "1120", "1130", "1200", "2100", "3900", "4100", "5100", "5200", "5300", "5400", "5600"]);
  const banks = await listBankAccounts();
  const main = banks.find((b) => b.accountId === a["1120"])!;
  const savings = banks.find((b) => b.accountId === a["1130"])!;
  const alborz = await saveParty({ name: "Alborz Trading", code: "C-001", phone: "021-5550101", isCustomer: true, notes: "Demo customer" });
  const pars = await saveParty({ name: "Pars Supplies", code: "S-001", phone: "021-5550202", isSupplier: true, isCustomer: true, notes: "Demo supplier (also buys occasionally)" });
  const M = 1_000_000;

  // 1. opening balances through a balanced opening journal, with party detail
  await createEntry(
    {
      date: "2026-01-01",
      description: "Opening balances",
      kind: "opening",
      lines: [
        { accountId: a["1120"], debit: 500 * M, credit: 0 },
        { accountId: a["1110"], debit: 20 * M, credit: 0 },
        { accountId: a["1200"], partyId: alborz, debit: 80 * M, credit: 0 },
        { accountId: a["2100"], partyId: pars, debit: 0, credit: 60 * M },
        { accountId: a["3900"], debit: 0, credit: 540 * M },
      ],
    },
    { post: true }
  );
  // 2. a receivable and its partial collection
  await createEntry(
    {
      date: "2026-01-05",
      description: "Consulting services invoiced to Alborz Trading",
      reference: "INV-0105",
      lines: [
        { accountId: a["1200"], partyId: alborz, debit: 120 * M, credit: 0 },
        { accountId: a["4100"], debit: 0, credit: 120 * M },
      ],
    },
    { post: true }
  );
  await quickTransaction({ type: "receipt", date: "2026-01-12", amount: 150 * M, bankAccountId: main.id, counterAccountId: a["1200"], partyId: alborz, reference: "RCPT-1001", description: "Partial collection from Alborz Trading" });
  // 3. a payable and its partial payment
  await createEntry(
    {
      date: "2026-01-08",
      description: "Office supplies bought on credit from Pars Supplies",
      reference: "BILL-0108",
      lines: [
        { accountId: a["5400"], debit: 45 * M, credit: 0 },
        { accountId: a["2100"], partyId: pars, debit: 0, credit: 45 * M },
      ],
    },
    { post: true }
  );
  await quickTransaction({ type: "payment", date: "2026-01-15", amount: 70 * M, bankAccountId: main.id, counterAccountId: a["2100"], partyId: pars, reference: "PAY-2001", description: "Partial payment to Pars Supplies" });
  // 4. an expense, 5. a transfer between own accounts
  await quickTransaction({ type: "expense", date: "2026-01-18", amount: 30 * M, bankAccountId: main.id, counterAccountId: a["5100"], reference: "RENT-JAN", description: "Office rent January" });
  await quickTransaction({ type: "transfer", date: "2026-01-20", amount: 100 * M, bankAccountId: main.id, toBankAccountId: savings.id, reference: "TRF-01", description: "Transfer to savings" });
  // 6. two same-amount payments without references: matching them needs care
  await quickTransaction({ type: "expense", date: "2026-01-22", amount: 12_500_000, bankAccountId: main.id, counterAccountId: a["5300"], description: "Electricity bill" });
  await quickTransaction({ type: "expense", date: "2026-01-23", amount: 12_500_000, bankAccountId: main.id, counterAccountId: a["5600"], description: "Courier and delivery" });
  // 7. a payment that has not reached the bank statement yet
  await quickTransaction({ type: "expense", date: "2026-01-28", amount: 25 * M, bankAccountId: main.id, counterAccountId: a["5200"], reference: "CHQ-3003", description: "Salary cheque (not yet cashed)" });
  // 8. a draft waiting for attention
  await createEntry({
    date: "2026-01-30",
    description: "Draft: equipment purchase (waiting for the invoice)",
    lines: [{ accountId: a["1120"], debit: 0, credit: 18 * M }],
  });

  // 9. the bank statement: carries a fee the books do not have, and lacks the salary cheque
  const file = path.join(process.cwd(), "samples", "demo-bank-statement.csv");
  await commitImport(main.id, "demo-bank-statement.csv", await readFile(file), DEMO_STATEMENT_MAPPING, {
    openingBalance: 500 * M,
    openingDate: "2026-01-01",
    closingBalance: 424_650_000,
  });
  await audit(db, "demo.loaded", "settings", null, "Loaded the demo dataset");
}

/** Removes the demo books entirely and reinstalls the empty starter setup. */
export async function clearDemo() {
  const settings = await getSettings();
  if (!settings.isDemo) fail("These books are not demo books; nothing was removed.");
  await resetAccounting();
}
