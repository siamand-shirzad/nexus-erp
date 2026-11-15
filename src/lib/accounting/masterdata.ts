import { eq, sql, asc, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  accAccounts,
  accParties,
  accBankAccounts,
  accLines,
  accSettings,
  accStatementImports,
  accReconMatches,
  accReconciliations,
  type AccAccount,
  type AccCategory,
} from "@/db/accounting-schema";
import { AccError, audit, clean, cleanOrNull, fail, transaction, type DbLike } from "./core";

export const CATEGORIES: AccCategory[] = ["asset", "liability", "equity", "income", "expense"];
export const CATEGORY_LABEL: Record<AccCategory, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

// ------------------------------------------------------------------ accounts
export interface AccountRow extends AccAccount {
  lineCount: number;
  childCount: number;
  /** may receive journal lines: flagged as posting, and a leaf */
  postable: boolean;
  depth: number;
}

export async function listAccounts(tx: DbLike = db): Promise<AccountRow[]> {
  const [rows, counts] = await Promise.all([
    tx.select().from(accAccounts).orderBy(asc(accAccounts.code)),
    tx
      .select({ accountId: accLines.accountId, n: sql<number>`count(*)::int` })
      .from(accLines)
      .groupBy(accLines.accountId),
  ]);
  const lineCount = new Map(counts.map((c) => [c.accountId, Number(c.n)]));
  const childCount = new Map<string, number>();
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows)
    if (r.parentId) childCount.set(r.parentId, (childCount.get(r.parentId) ?? 0) + 1);
  const depthOf = (r: AccAccount): number => {
    let d = 0;
    for (let p = r.parentId; p && d < 20; p = byId.get(p)?.parentId ?? null) d++;
    return d;
  };
  return rows.map((r) => ({
    ...r,
    lineCount: lineCount.get(r.id) ?? 0,
    childCount: childCount.get(r.id) ?? 0,
    postable: r.isPosting && !(childCount.get(r.id) ?? 0),
    depth: depthOf(r),
  }));
}

/** The account itself plus every descendant. */
export function withDescendants(accounts: AccAccount[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++)
    for (const a of accounts) if (a.parentId === out[i]) out.push(a.id);
  return out;
}

export interface AccountInput {
  code: string;
  name: string;
  category: AccCategory;
  parentId?: string | null;
  isActive?: boolean;
  isPosting?: boolean;
  requiresParty?: boolean;
}

export async function saveAccount(input: AccountInput, id?: string): Promise<string> {
  return transaction(async (tx) => {
    const all = await listAccounts(tx);
    const existing = id ? all.find((a) => a.id === id) : undefined;
    if (id && !existing) fail("Account not found.");

    const code = clean(input.code);
    const name = clean(input.name);
    const parentId = input.parentId || null;
    const isPosting = input.isPosting ?? true;
    const requiresParty = input.requiresParty ?? false;
    if (!code) fail("Account code is required.", "code");
    if (!name) fail("Account name is required.", "name");
    if (!CATEGORIES.includes(input.category)) fail("Choose a category.", "category");
    if (all.some((a) => a.code === code && a.id !== id))
      fail(`Account code ${code} is already in use.`, "code");

    const parent = parentId ? all.find((a) => a.id === parentId) : undefined;
    if (parentId) {
      if (!parent) fail("Parent account not found.", "parentId");
      if (parent.category !== input.category)
        fail("A sub-account must have the same category as its parent.", "parentId");
      if (parent.lineCount > 0)
        fail(
          `${parent.code} already has journal lines, so it cannot become a parent account.`,
          "parentId"
        );
      if (id && withDescendants(all, id).includes(parentId))
        fail("An account cannot be moved under itself or one of its sub-accounts.", "parentId");
    }

    if (existing) {
      if (existing.category !== input.category && (existing.lineCount || existing.childCount))
        fail(
          "The category cannot change once the account has journal lines or sub-accounts.",
          "category"
        );
      if (isPosting && existing.childCount)
        fail("An account with sub-accounts cannot allow posting.", "isPosting");
      if (!isPosting && existing.lineCount)
        fail("This account already has journal lines, so posting must stay allowed.", "isPosting");
      if (requiresParty && !existing.requiresParty && existing.lineCount) {
        const [missing] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(accLines)
          .where(and(eq(accLines.accountId, existing.id), isNull(accLines.partyId)));
        if (Number(missing.n) > 0)
          fail(
            "Existing journal lines on this account have no party, so a party cannot be made mandatory.",
            "requiresParty"
          );
      }
    }

    const values = {
      code,
      name,
      category: input.category,
      parentId,
      isActive: input.isActive ?? true,
      isPosting,
      requiresParty,
    };
    // a parent is a summary account: it stops accepting postings (it has no lines, checked above)
    if (parent?.isPosting)
      await tx.update(accAccounts).set({ isPosting: false }).where(eq(accAccounts.id, parent.id));

    if (existing) {
      await tx.update(accAccounts).set(values).where(eq(accAccounts.id, existing.id));
      await audit(tx, "account.updated", "account", existing.id, `Updated account ${code} ${name}`);
      return existing.id;
    }
    const [row] = await tx.insert(accAccounts).values(values).returning({ id: accAccounts.id });
    await audit(tx, "account.created", "account", row.id, `Created account ${code} ${name}`);
    return row.id;
  });
}

export async function deleteAccount(id: string) {
  return transaction(async (tx) => {
    const all = await listAccounts(tx);
    const a = all.find((x) => x.id === id);
    if (!a) fail("Account not found.");
    if (a.lineCount)
      fail(`${a.code} is used by ${a.lineCount} journal line(s). Deactivate it instead of deleting.`);
    if (a.childCount) fail("Delete or move its sub-accounts first.");
    const [bank] = await tx
      .select({ id: accBankAccounts.id })
      .from(accBankAccounts)
      .where(eq(accBankAccounts.accountId, id));
    if (bank) fail("This account is linked to a bank or cash account.");
    const [s] = await tx.select().from(accSettings);
    if (s?.retainedEarningsAccountId === id)
      fail("This is the retained earnings account used for year-end closing.");
    await tx.delete(accAccounts).where(eq(accAccounts.id, id));
    await audit(tx, "account.deleted", "account", id, `Deleted account ${a.code} ${a.name}`);
  });
}

// ------------------------------------------------------------------- parties
export interface PartyInput {
  name: string;
  phone?: string | null;
  code?: string | null;
  notes?: string | null;
  isCustomer?: boolean;
  isSupplier?: boolean;
  isActive?: boolean;
}

export const listParties = (tx: DbLike = db) =>
  tx.select().from(accParties).orderBy(asc(accParties.name));

export async function saveParty(input: PartyInput, id?: string): Promise<string> {
  const name = clean(input.name);
  const code = cleanOrNull(input.code);
  if (!name) fail("Party name is required.", "name");
  return transaction(async (tx) => {
    if (code) {
      const [dupe] = await tx.select().from(accParties).where(eq(accParties.code, code));
      if (dupe && dupe.id !== id) fail(`Reference code ${code} is already in use.`, "code");
    }
    const values = {
      name,
      code,
      phone: cleanOrNull(input.phone),
      notes: cleanOrNull(input.notes),
      isCustomer: !!input.isCustomer,
      isSupplier: !!input.isSupplier,
      isActive: input.isActive ?? true,
    };
    if (id) {
      const [row] = await tx
        .update(accParties)
        .set(values)
        .where(eq(accParties.id, id))
        .returning({ id: accParties.id });
      if (!row) fail("Party not found.");
      return id;
    }
    const [row] = await tx.insert(accParties).values(values).returning({ id: accParties.id });
    return row.id;
  });
}

export async function deleteParty(id: string) {
  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accLines)
    .where(eq(accLines.partyId, id));
  if (Number(used.n) > 0)
    fail("This party has journal lines. Mark it inactive instead of deleting.");
  await db.delete(accParties).where(eq(accParties.id, id));
}

// ------------------------------------------------------- bank & cash accounts
export interface BankAccountInput {
  name: string;
  kind: "bank" | "cash";
  accountId: string;
  bankName?: string | null;
  accountNumber?: string | null;
  isActive?: boolean;
}

export async function listBankAccounts(tx: DbLike = db) {
  return tx
    .select({
      id: accBankAccounts.id,
      name: accBankAccounts.name,
      kind: accBankAccounts.kind,
      accountId: accBankAccounts.accountId,
      bankName: accBankAccounts.bankName,
      accountNumber: accBankAccounts.accountNumber,
      isActive: accBankAccounts.isActive,
      accountCode: accAccounts.code,
      accountName: accAccounts.name,
    })
    .from(accBankAccounts)
    .innerJoin(accAccounts, eq(accAccounts.id, accBankAccounts.accountId))
    .orderBy(asc(accAccounts.code));
}
export type BankAccountRow = Awaited<ReturnType<typeof listBankAccounts>>[number];

export async function saveBankAccount(input: BankAccountInput, id?: string): Promise<string> {
  const name = clean(input.name);
  if (!name) fail("Name is required.", "name");
  if (input.kind !== "bank" && input.kind !== "cash") fail("Choose bank or cash.", "kind");
  return transaction(async (tx) => {
    const accounts = await listAccounts(tx);
    const ledger = accounts.find((a) => a.id === input.accountId);
    if (!ledger) fail("Choose the ledger account.", "accountId");
    if (ledger.category !== "asset" || !ledger.postable)
      fail("The ledger account must be an asset account that allows posting.", "accountId");
    const [linked] = await tx
      .select()
      .from(accBankAccounts)
      .where(eq(accBankAccounts.accountId, input.accountId));
    if (linked && linked.id !== id)
      fail(`${ledger.code} is already linked to "${linked.name}".`, "accountId");

    const values = {
      name,
      kind: input.kind,
      accountId: input.accountId,
      bankName: cleanOrNull(input.bankName),
      accountNumber: cleanOrNull(input.accountNumber),
      isActive: input.isActive ?? true,
    };
    if (id) {
      const [current] = await tx.select().from(accBankAccounts).where(eq(accBankAccounts.id, id));
      if (!current) fail("Bank account not found.");
      if (current.accountId !== input.accountId) {
        const [m] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(accReconMatches)
          .where(eq(accReconMatches.bankAccountId, id));
        if (Number(m.n) > 0)
          fail("The ledger account cannot change after reconciliation matches exist.", "accountId");
      }
      await tx.update(accBankAccounts).set(values).where(eq(accBankAccounts.id, id));
      return id;
    }
    const [row] = await tx
      .insert(accBankAccounts)
      .values(values)
      .returning({ id: accBankAccounts.id });
    await audit(tx, "bank.created", "bank", row.id, `Added ${input.kind} account ${name}`);
    return row.id;
  });
}

export async function deleteBankAccount(id: string) {
  return transaction(async (tx) => {
    const [imp] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(accStatementImports)
      .where(eq(accStatementImports.bankAccountId, id));
    const [rec] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(accReconciliations)
      .where(eq(accReconciliations.bankAccountId, id));
    if (Number(imp.n) + Number(rec.n) > 0)
      throw new AccError(
        "This account has imported statements or reconciliations. Mark it inactive instead."
      );
    await tx.delete(accBankAccounts).where(eq(accBankAccounts.id, id));
    await audit(tx, "bank.deleted", "bank", id, "Removed bank/cash account (ledger account kept)");
  });
}
