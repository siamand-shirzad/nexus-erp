import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accBankAccounts,
  accEntries,
  accLines,
  accReconMatches,
  accReconMatchLines,
  accReconciliations,
  accStatementImports,
  accStatementLines,
} from "@/db/accounting-schema";
import {
  addDays,
  audit,
  clean,
  daysBetween,
  fail,
  isIsoDate,
  num,
  transaction,
  type DbLike,
} from "./core";
import { createEntryTx } from "./journal";
import { getSettings } from "./setup";
import {
  mapRows,
  parseStatementFile,
  validateMapping,
  type StatementMapping,
  type StatementRow,
} from "./statement";

// =============================================================== statement import
async function getBank(tx: DbLike, id: string) {
  const [bank] = await tx.select().from(accBankAccounts).where(eq(accBankAccounts.id, id));
  if (!bank) fail("Bank account not found.");
  return bank;
}

const hashOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Step 1 of the import: read the file and show its columns and first rows. */
export async function readStatementFile(filename: string, bytes: Uint8Array) {
  const file = await parseStatementFile(filename, bytes);
  return {
    headers: file.headers,
    sample: file.rows
      .slice(0, 8)
      .map((r) =>
        file.headers.map((_, i) => {
          const c = r[i];
          return c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c);
        })
      ),
    rowCount: file.rows.length,
  };
}

/**
 * Step 2: apply the user's mapping and report exactly what would happen. Nothing is written.
 * - invalid rows are listed and block the import (no silent omissions)
 * - rows whose bank transaction id is already stored are listed as already imported
 * - rows without an id that look like stored rows are imported but flagged for review
 */
export async function previewImport(
  bankAccountId: string,
  filename: string,
  bytes: Uint8Array,
  mapping: StatementMapping,
  tx: DbLike = db
) {
  await getBank(tx, bankAccountId);
  const { decimals } = await getSettings(tx);
  const file = await parseStatementFile(filename, bytes);
  validateMapping(mapping, file.headers.length);
  const { rows, errors, blank } = mapRows(file, mapping, decimals);

  const fileHash = hashOf(bytes);
  const [sameFile] = await tx
    .select()
    .from(accStatementImports)
    .where(
      and(eq(accStatementImports.bankAccountId, bankAccountId), eq(accStatementImports.fileHash, fileHash))
    );
  const existing = await tx
    .select()
    .from(accStatementLines)
    .where(eq(accStatementLines.bankAccountId, bankAccountId));
  const knownIds = new Set(existing.map((e) => e.externalId).filter(Boolean));
  const fingerprint = (r: { date: string; amount: number; description: string }) =>
    `${r.date}|${r.amount}|${r.description.toLowerCase()}`;
  const knownPrints = new Set(existing.filter((e) => !e.isOpening).map(fingerprint));

  const alreadyImported: StatementRow[] = [];
  const fresh: Array<StatementRow & { likelyDuplicate: boolean }> = [];
  for (const r of rows) {
    if (r.externalId && knownIds.has(r.externalId)) alreadyImported.push(r);
    // same date and amount alone is not proof of a duplicate, so these are kept and flagged
    else fresh.push({ ...r, likelyDuplicate: !r.externalId && knownPrints.has(fingerprint(r)) });
  }
  return {
    fileHash,
    fileAlreadyImported: sameFile ? sameFile.importedAt.toISOString() : null,
    rows: fresh,
    alreadyImported,
    errors,
    blank,
    total: fresh.reduce((s, r) => s + r.amount, 0),
    fromDate: fresh.length ? fresh.reduce((m, r) => (r.date < m ? r.date : m), fresh[0].date) : null,
    toDate: fresh.length ? fresh.reduce((m, r) => (r.date > m ? r.date : m), fresh[0].date) : null,
  };
}

export interface ImportExtras {
  /** statement balance before the first imported transaction, when the file does not carry it */
  openingBalance?: number | null;
  openingDate?: string | null;
  closingBalance?: number | null;
}

/** Step 3: store the statement lines. Importing never creates journal entries. */
export function commitImport(
  bankAccountId: string,
  filename: string,
  bytes: Uint8Array,
  mapping: StatementMapping,
  extras: ImportExtras = {}
) {
  return transaction(async (tx) => {
    const p = await previewImport(bankAccountId, filename, bytes, mapping, tx);
    if (p.fileAlreadyImported) fail("This exact file has already been imported for this account.");
    if (p.errors.length)
      fail(`${p.errors.length} row(s) are invalid. Fix the file or the column mapping; nothing was imported.`);
    if (!p.rows.length) fail("Every transaction in this file has already been imported.");

    const opening = extras.openingBalance ?? null;
    if (opening != null) {
      if (!Number.isSafeInteger(opening)) fail("Invalid opening balance.", "openingBalance");
      const [has] = await tx
        .select()
        .from(accStatementLines)
        .where(and(eq(accStatementLines.bankAccountId, bankAccountId), eq(accStatementLines.isOpening, true)));
      if (has) fail("A statement opening balance is already recorded for this account.", "openingBalance");
    }
    const openingDate = extras.openingDate || addDays(p.fromDate!, -1);
    if (opening != null && (!isIsoDate(openingDate) || openingDate > p.fromDate!))
      fail("The opening balance date must not be after the first transaction.", "openingDate");

    const [imp] = await tx
      .insert(accStatementImports)
      .values({
        bankAccountId,
        filename: clean(filename).replace(/^.*[\\/]/, "").slice(0, 200),
        fileHash: p.fileHash,
        rowCount: p.rows.length,
        openingBalance: opening,
        closingBalance: extras.closingBalance ?? null,
        fromDate: p.fromDate,
        toDate: p.toDate,
      })
      .returning();
    const values = p.rows.map((r) => ({
      importId: imp.id,
      bankAccountId,
      lineNo: r.rowNo,
      date: r.date,
      description: r.description,
      reference: r.reference,
      externalId: r.externalId,
      amount: r.amount,
      runningBalance: r.runningBalance,
      duplicateFlag: r.likelyDuplicate,
      isOpening: false,
    }));
    if (opening)
      values.unshift({
        importId: imp.id,
        bankAccountId,
        lineNo: 0,
        date: openingDate,
        description: "Statement opening balance",
        reference: null,
        externalId: null,
        amount: opening,
        runningBalance: opening,
        duplicateFlag: false,
        isOpening: true,
      });
    await tx.insert(accStatementLines).values(values);
    const flagged = p.rows.filter((r) => r.likelyDuplicate).length;
    await audit(tx, "statement.imported", "bank", bankAccountId, `Imported ${p.rows.length} statement line(s) from ${imp.filename}`, {
      importId: imp.id,
      skippedAlreadyImported: p.alreadyImported.length,
      flaggedLikelyDuplicates: flagged,
    });
    return { importId: imp.id, imported: p.rows.length, skipped: p.alreadyImported.length, flagged };
  });
}

export function deleteImport(importId: string) {
  return transaction(async (tx) => {
    const [imp] = await tx.select().from(accStatementImports).where(eq(accStatementImports.id, importId));
    if (!imp) fail("Import not found.");
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(accStatementLines)
      .where(and(eq(accStatementLines.importId, importId), sql`${accStatementLines.matchId} is not null`));
    if (num(n) > 0) fail("Some lines of this import are matched. Unmatch them before deleting the import.");
    await tx.delete(accStatementImports).where(eq(accStatementImports.id, importId));
    await audit(tx, "statement.import_deleted", "bank", imp.bankAccountId, `Deleted statement import ${imp.filename}`);
  });
}

/** Review of a line flagged as a likely duplicate: keep it (clear the flag) or remove it. */
export function resolveDuplicate(statementLineId: string, action: "keep" | "delete") {
  return transaction(async (tx) => {
    const [line] = await tx.select().from(accStatementLines).where(eq(accStatementLines.id, statementLineId));
    if (!line) fail("Statement line not found.");
    if (action === "keep") {
      await tx.update(accStatementLines).set({ duplicateFlag: false }).where(eq(accStatementLines.id, line.id));
    } else {
      if (line.matchId) fail("Unmatch this line before deleting it.");
      await tx.delete(accStatementLines).where(eq(accStatementLines.id, line.id));
    }
    await audit(tx, `statement.duplicate_${action}`, "bank", line.bankAccountId, `Likely duplicate ${action === "keep" ? "kept" : "deleted"}: ${line.date} ${line.description}`, { amount: line.amount });
  });
}

export async function listImports(bankAccountId: string) {
  return db
    .select()
    .from(accStatementImports)
    .where(eq(accStatementImports.bankAccountId, bankAccountId))
    .orderBy(desc(accStatementImports.importedAt));
}

export async function listStatementLines(bankAccountId: string) {
  return db
    .select()
    .from(accStatementLines)
    .where(eq(accStatementLines.bankAccountId, bankAccountId))
    .orderBy(desc(accStatementLines.date), desc(accStatementLines.lineNo))
    .limit(1000);
}

// ============================================================ match suggestions
export interface MatchLine {
  id: string;
  date: string;
  /** signed: money in > 0, money out < 0 (for book lines: debit minus credit on the bank ledger account) */
  amount: number;
  reference: string | null;
  description: string;
}
export interface Suggestions {
  /** one clear candidate; still needs the user's confirmation */
  suggested: Array<{ statementId: string; bookId: string; reasons: string[] }>;
  /** several plausible candidates; never resolved automatically */
  ambiguous: Array<{ statementId: string; candidateBookIds: string[]; reason: string }>;
  /** same reference, different amount */
  amountDifferences: Array<{ statementId: string; bookId: string; difference: number }>;
}

const DATE_WINDOW_DAYS = 10;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, "");
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9؀-ۿ]+/).filter((t) => t.length >= 4));

function referenceMatches(s: MatchLine, b: MatchLine) {
  const sr = norm(s.reference);
  const br = norm(b.reference);
  if (sr.length >= 3 && (sr === br || norm(b.description).includes(sr))) return true;
  return br.length >= 3 && norm(s.description).includes(br);
}

/**
 * Proposes matches between unmatched statement lines and unmatched book lines.
 * An equal amount is necessary but never sufficient: a suggestion needs either a matching
 * reference or to be the only possible pairing in both directions within the date window.
 */
export function suggestMatches(statement: MatchLine[], book: MatchLine[]): Suggestions {
  const out: Suggestions = { suggested: [], ambiguous: [], amountDifferences: [] };
  const candidates = new Map<string, MatchLine[]>();
  const rivals = new Map<string, number>(); // book line id -> number of statement lines it could pair with
  for (const s of statement) {
    const c = book.filter(
      (b) => b.amount === s.amount && Math.abs(daysBetween(s.date, b.date)) <= DATE_WINDOW_DAYS
    );
    candidates.set(s.id, c);
    for (const b of c) rivals.set(b.id, (rivals.get(b.id) ?? 0) + 1);
  }

  const picks: Array<{ s: MatchLine; b: MatchLine; byReference: boolean }> = [];
  for (const s of statement) {
    const c = candidates.get(s.id)!;
    if (!c.length) continue;
    const byRef = c.filter((b) => referenceMatches(s, b));
    if (byRef.length === 1) picks.push({ s, b: byRef[0], byReference: true });
    else if (byRef.length === 0 && c.length === 1 && rivals.get(c[0].id) === 1)
      picks.push({ s, b: c[0], byReference: false });
    else
      out.ambiguous.push({
        statementId: s.id,
        candidateBookIds: c.map((b) => b.id),
        reason:
          c.length > 1
            ? `${c.length} book transactions have this amount`
            : "another statement line has the same amount",
      });
  }
  // a book line may be claimed once; a reference beats amount-only claims
  const byBook = new Map<string, typeof picks>();
  for (const p of picks) byBook.set(p.b.id, [...(byBook.get(p.b.id) ?? []), p]);
  const used = new Set<string>();
  for (const group of byBook.values()) {
    const refs = group.filter((g) => g.byReference);
    const winner = group.length === 1 ? group[0] : refs.length === 1 ? refs[0] : null;
    for (const g of group) {
      if (g !== winner) {
        out.ambiguous.push({
          statementId: g.s.id,
          candidateBookIds: [g.b.id],
          reason: "another statement line also fits this book transaction",
        });
        continue;
      }
      used.add(g.b.id);
      const days = Math.abs(daysBetween(g.s.date, g.b.date));
      const reasons = ["same amount", days === 0 ? "same date" : `${days} day(s) apart`];
      if (g.byReference) reasons.unshift("reference matches");
      const st = tokens(g.s.description);
      if ([...tokens(g.b.description)].some((t) => st.has(t))) reasons.push("similar description");
      out.suggested.push({ statementId: g.s.id, bookId: g.b.id, reasons });
    }
  }

  const settled = new Set([...out.suggested.map((x) => x.statementId), ...out.ambiguous.map((x) => x.statementId)]);
  for (const s of statement) {
    if (settled.has(s.id)) continue;
    const b = book.find(
      (x) => !used.has(x.id) && x.amount !== s.amount && Math.sign(x.amount) === Math.sign(s.amount) && referenceMatches(s, x)
    );
    if (b) out.amountDifferences.push({ statementId: s.id, bookId: b.id, difference: s.amount - b.amount });
  }
  return out;
}

// ================================================================== workspace
export interface WsStatementLine extends MatchLine {
  isOpening: boolean;
  duplicateFlag: boolean;
  matchId: string | null;
}
export interface WsBookLine extends MatchLine {
  entryId: string;
  entryNumber: string;
  partyName: string | null;
  matchId: string | null;
}

async function loadLines(tx: DbLike, bankAccountId: string) {
  const bank = await getBank(tx, bankAccountId);
  // ponytail: loads the account's full history; add a date floor if an account reaches tens of thousands of lines
  const stmt = await tx
    .select()
    .from(accStatementLines)
    .where(eq(accStatementLines.bankAccountId, bankAccountId))
    .orderBy(asc(accStatementLines.date), asc(accStatementLines.lineNo));
  const bookRaw = (
    await tx.execute(sql`
      select l.id, e.id as entry_id, e.entry_number, e.date::text as date, e.reference,
             coalesce(nullif(l.description, ''), e.description) as description,
             l.debit - l.credit as amount, p.name as party_name, ml.match_id
        from acc_lines l
        join acc_entries e on e.id = l.entry_id
        left join acc_parties p on p.id = l.party_id
        left join acc_recon_match_lines ml on ml.journal_line_id = l.id
       where e.status = 'posted' and l.account_id = ${bank.accountId}
       order by e.date, e.seq, l.line_no`)
  ).rows as Array<Record<string, unknown>>;
  const statement: WsStatementLine[] = stmt.map((s) => ({
    id: s.id,
    date: s.date,
    amount: s.amount,
    reference: s.reference,
    description: s.description,
    isOpening: s.isOpening,
    duplicateFlag: s.duplicateFlag,
    matchId: s.matchId,
  }));
  const book: WsBookLine[] = bookRaw.map((b) => ({
    id: String(b.id),
    entryId: String(b.entry_id),
    entryNumber: String(b.entry_number),
    date: String(b.date),
    amount: num(b.amount),
    reference: (b.reference as string) ?? null,
    description: String(b.description ?? ""),
    partyName: (b.party_name as string) ?? null,
    matchId: (b.match_id as string) ?? null,
  }));
  return { bank, statement, book, stmtRows: stmt };
}

const sum = (xs: Array<{ amount: number }>) => xs.reduce((s, x) => s + x.amount, 0);

/**
 * Everything the reconciliation screen and report need for one account at one cutoff date.
 *
 *   adjusted statement balance = statement closing balance + outstanding book items
 *   adjusted book balance      = book balance + statement items not yet in the books
 *   difference                 = adjusted book - adjusted statement   (must be zero to complete)
 *
 * An item counts as cleared at the cutoff only when every line of its match is dated on or
 * before the cutoff.
 */
export async function reconWorkspace(
  bankAccountId: string,
  cutoff: string,
  closingBalance: number | null,
  tx: DbLike = db
) {
  if (!isIsoDate(cutoff)) fail("Choose a cutoff date.", "cutoff");
  const { bank, statement, book, stmtRows } = await loadLines(tx, bankAccountId);

  const matchLastDate = new Map<string, string>();
  for (const l of [...statement, ...book])
    if (l.matchId && l.date > (matchLastDate.get(l.matchId) ?? "")) matchLastDate.set(l.matchId, l.date);
  const cleared = (l: { matchId: string | null }) =>
    !!l.matchId && matchLastDate.get(l.matchId)! <= cutoff;

  const stmtInScope = statement.filter((s) => s.date <= cutoff);
  const bookInScope = book.filter((b) => b.date <= cutoff);
  const unrecordedStatement = stmtInScope.filter((s) => !cleared(s));
  const outstandingBook = bookInScope.filter((b) => !cleared(b));

  const matchRows = await tx
    .select()
    .from(accReconMatches)
    .where(eq(accReconMatches.bankAccountId, bankAccountId));
  const confirmed = matchRows
    .filter((m) => (matchLastDate.get(m.id) ?? "9999") <= cutoff)
    .map((m) => ({
      id: m.id,
      reconciliationId: m.reconciliationId,
      statement: statement.filter((s) => s.matchId === m.id),
      book: book.filter((b) => b.matchId === m.id),
    }))
    .sort((a, b) => (a.statement[0]?.date ?? "").localeCompare(b.statement[0]?.date ?? ""));

  const suggestions = suggestMatches(
    unrecordedStatement.filter((s) => !s.matchId),
    outstandingBook.filter((b) => !b.matchId)
  );

  const bookBalance = sum(bookInScope);
  const statementTotal = sum(stmtInScope);
  const withBalance = [...stmtRows].reverse().find((s) => s.date <= cutoff && s.runningBalance != null);
  const hasOpening = statement.some((s) => s.isOpening);
  const suggestedClosing = withBalance?.runningBalance ?? (hasOpening ? statementTotal : null);

  const [previous] = await tx
    .select()
    .from(accReconciliations)
    .where(and(eq(accReconciliations.bankAccountId, bankAccountId), eq(accReconciliations.status, "completed")))
    .orderBy(desc(accReconciliations.cutoffDate))
    .limit(1);
  const adjustments = (
    await tx.execute(sql`
      select e.id, e.entry_number, e.date::text as date, e.description, l.debit - l.credit as amount
        from acc_entries e join acc_lines l on l.entry_id = e.id and l.account_id = ${bank.accountId}
       where e.status = 'posted' and e.kind = 'adjustment' and e.date <= ${cutoff}
         and e.date > ${previous?.cutoffDate ?? "0001-01-01"}
       order by e.date, e.seq`)
  ).rows.map((r) => ({
    entryId: String(r.id),
    entryNumber: String(r.entry_number),
    date: String(r.date),
    description: String(r.description),
    amount: num(r.amount),
  }));

  const outstandingTotal = sum(outstandingBook);
  const unrecordedTotal = sum(unrecordedStatement);
  const report = {
    cutoff,
    statementClosingBalance: closingBalance,
    suggestedClosing,
    bookBalance,
    outstandingBookTotal: outstandingTotal,
    unrecordedStatementTotal: unrecordedTotal,
    adjustedStatementBalance: closingBalance == null ? null : closingBalance + outstandingTotal,
    adjustedBookBalance: bookBalance + unrecordedTotal,
    difference:
      closingBalance == null ? null : bookBalance + unrecordedTotal - (closingBalance + outstandingTotal),
    /** sum of every imported statement line up to the cutoff; differs from the closing balance when history is missing */
    importedStatementTotal: statementTotal,
    hasOpeningBalance: hasOpening,
    adjustmentsTotal: sum(adjustments),
  };
  return {
    bank,
    report,
    confirmed,
    suggestions,
    unrecordedStatement,
    outstandingBook,
    adjustments,
    previousCutoff: previous?.cutoffDate ?? null,
  };
}
export type ReconWorkspace = Awaited<ReturnType<typeof reconWorkspace>>;

// ============================================================= matching actions
/**
 * Confirms a match group: one-to-one, one statement line to many book lines, or many
 * statement lines to one book line. Group totals must agree exactly, and no line may
 * already belong to another match.
 */
export function confirmMatch(bankAccountId: string, statementLineIds: string[], journalLineIds: string[]) {
  return transaction(async (tx) => {
    const sIds = [...new Set(statementLineIds)];
    const bIds = [...new Set(journalLineIds)];
    if (!sIds.length || !bIds.length)
      fail("Select at least one statement line and one book transaction.");
    const bank = await getBank(tx, bankAccountId);
    const sLines = await tx.select().from(accStatementLines).where(inArray(accStatementLines.id, sIds));
    if (sLines.length !== sIds.length || sLines.some((s) => s.bankAccountId !== bankAccountId))
      fail("A selected statement line does not belong to this account.");
    if (sLines.some((s) => s.matchId))
      fail("A selected statement line is already matched. Unmatch it first.");

    const bLines = await tx
      .select({
        id: accLines.id,
        accountId: accLines.accountId,
        debit: accLines.debit,
        credit: accLines.credit,
        status: accEntries.status,
      })
      .from(accLines)
      .innerJoin(accEntries, eq(accEntries.id, accLines.entryId))
      .where(inArray(accLines.id, bIds));
    if (
      bLines.length !== bIds.length ||
      bLines.some((b) => b.accountId !== bank.accountId || b.status !== "posted")
    )
      fail("A selected book transaction is not a posted line of this account's ledger.");
    const taken = await tx
      .select()
      .from(accReconMatchLines)
      .where(inArray(accReconMatchLines.journalLineId, bIds));
    if (taken.length) fail("A selected book transaction is already matched. Unmatch it first.");

    const statementTotal = sLines.reduce((s, l) => s + l.amount, 0);
    const bookTotal = bLines.reduce((s, l) => s + l.debit - l.credit, 0);
    if (statementTotal !== bookTotal)
      fail(
        `Totals do not agree: statement ${statementTotal} vs books ${bookTotal} (minor units). Matched groups must agree exactly.`
      );

    const [match] = await tx.insert(accReconMatches).values({ bankAccountId }).returning();
    await tx.update(accStatementLines).set({ matchId: match.id }).where(inArray(accStatementLines.id, sIds));
    await tx.insert(accReconMatchLines).values(bIds.map((journalLineId) => ({ journalLineId, matchId: match.id })));
    await audit(tx, "recon.matched", "bank", bankAccountId, `Matched ${sIds.length} statement line(s) to ${bIds.length} book line(s)`, {
      matchId: match.id,
      total: statementTotal,
    });
    return match.id;
  });
}

export function unmatch(matchId: string) {
  return transaction(async (tx) => {
    const [m] = await tx.select().from(accReconMatches).where(eq(accReconMatches.id, matchId));
    if (!m) fail("Match not found.");
    if (m.reconciliationId)
      fail("This match is part of a completed reconciliation. Void that reconciliation first.");
    await tx.delete(accReconMatches).where(eq(accReconMatches.id, matchId));
    await audit(tx, "recon.unmatched", "bank", m.bankAccountId, "Removed a match", { matchId });
  });
}

export interface AdjustmentInput {
  statementLineId: string;
  counterAccountId: string;
  partyId?: string | null;
  description: string;
  date?: string;
  /** the user must explicitly approve posting */
  approved: boolean;
}

/**
 * Books a statement-only item (bank fee, interest...) after review: the user picks the
 * counterpart account and approves. The entry is posted through the normal journal path
 * and matched to the statement line. Nothing is ever plugged automatically.
 */
export function createAdjustment(input: AdjustmentInput) {
  return transaction(async (tx) => {
    if (!input.approved) fail("Approve the adjusting entry before it is posted.", "approved");
    const [line] = await tx
      .select()
      .from(accStatementLines)
      .where(eq(accStatementLines.id, input.statementLineId));
    if (!line) fail("Statement line not found.");
    if (line.matchId) fail("This statement line is already matched.");
    if (line.isOpening) fail("An opening balance is matched to your opening entry, not adjusted.");
    if (!input.counterAccountId) fail("Choose the counterpart account.", "counterAccountId");
    const bank = await getBank(tx, line.bankAccountId);
    if (input.counterAccountId === bank.accountId)
      fail("The counterpart cannot be the bank account itself.", "counterAccountId");
    const amount = Math.abs(line.amount);
    const bankLine = { accountId: bank.accountId, debit: line.amount > 0 ? amount : 0, credit: line.amount < 0 ? amount : 0 };
    const counterLine = {
      accountId: input.counterAccountId,
      partyId: input.partyId || null,
      debit: line.amount < 0 ? amount : 0,
      credit: line.amount > 0 ? amount : 0,
    };
    const entry = await createEntryTx(
      tx,
      {
        date: input.date || line.date,
        description: clean(input.description) || line.description || "Bank statement adjustment",
        reference: line.reference,
        kind: "adjustment",
        lines: [bankLine, counterLine],
      },
      { post: true }
    );
    const [posted] = await tx
      .select({ id: accLines.id })
      .from(accLines)
      .where(and(eq(accLines.entryId, entry.id), eq(accLines.accountId, bank.accountId)));
    const [match] = await tx.insert(accReconMatches).values({ bankAccountId: bank.id }).returning();
    await tx.update(accStatementLines).set({ matchId: match.id }).where(eq(accStatementLines.id, line.id));
    await tx.insert(accReconMatchLines).values({ journalLineId: posted.id, matchId: match.id });
    await audit(tx, "recon.adjustment", "bank", bank.id, `Posted adjusting entry ${entry.entryNumber} for a statement item`, {
      entryId: entry.id,
      statementLineId: line.id,
      amount: line.amount,
    });
    return entry;
  });
}

// ============================================================ completing / history
export function completeReconciliation(input: {
  bankAccountId: string;
  cutoff: string;
  closingBalance: number;
  /** required when statement items are still missing from the books */
  acceptUnrecorded?: boolean;
}) {
  return transaction(async (tx) => {
    if (!Number.isSafeInteger(input.closingBalance))
      fail("Enter the statement closing balance.", "closingBalance");
    const ws = await reconWorkspace(input.bankAccountId, input.cutoff, input.closingBalance, tx);
    if (ws.report.difference !== 0)
      fail(
        `An unexplained difference of ${ws.report.difference} (minor units) remains. The reconciliation cannot be completed.`
      );
    if (ws.unrecordedStatement.length && !input.acceptUnrecorded)
      fail(
        `${ws.unrecordedStatement.length} statement item(s) are not in the books. Record them, or explicitly accept them as open items.`,
        "acceptUnrecorded"
      );
    if (ws.previousCutoff && ws.previousCutoff >= input.cutoff)
      fail(`A reconciliation up to ${ws.previousCutoff} already exists. Void it before reconciling an earlier or equal date.`);

    const [rec] = await tx
      .insert(accReconciliations)
      .values({
        bankAccountId: input.bankAccountId,
        cutoffDate: input.cutoff,
        statementClosingBalance: input.closingBalance,
        bookBalance: ws.report.bookBalance,
        snapshot: {
          report: ws.report,
          confirmed: ws.confirmed,
          outstandingBook: ws.outstandingBook,
          unrecordedStatement: ws.unrecordedStatement,
          adjustments: ws.adjustments,
          acceptedUnrecorded: !!input.acceptUnrecorded && ws.unrecordedStatement.length > 0,
        },
      })
      .returning();
    const newlyCleared = ws.confirmed.filter((m) => !m.reconciliationId).map((m) => m.id);
    if (newlyCleared.length)
      await tx
        .update(accReconMatches)
        .set({ reconciliationId: rec.id })
        .where(inArray(accReconMatches.id, newlyCleared));
    await audit(tx, "recon.completed", "reconciliation", rec.id, `Completed reconciliation of ${ws.bank.name} to ${input.cutoff}`, {
      statementClosingBalance: input.closingBalance,
      bookBalance: ws.report.bookBalance,
      matches: newlyCleared.length,
    });
    return rec.id;
  });
}

export async function voidReconciliation(id: string, reason: string) {
  const why = clean(reason);
  if (why.length < 3) fail("Give a reason for voiding this reconciliation.", "reason");
  return transaction(async (tx) => {
    const [rec] = await tx.select().from(accReconciliations).where(eq(accReconciliations.id, id));
    if (!rec) fail("Reconciliation not found.");
    if (rec.status !== "completed") fail("This reconciliation is already voided.");
    await tx
      .update(accReconciliations)
      .set({ status: "voided", voidedAt: new Date(), voidReason: why })
      .where(eq(accReconciliations.id, id));
    await tx.update(accReconMatches).set({ reconciliationId: null }).where(eq(accReconMatches.reconciliationId, id));
    await audit(tx, "recon.voided", "reconciliation", id, `Voided reconciliation to ${rec.cutoffDate}`, { reason: why });
  });
}

export async function listReconciliations(bankAccountId?: string) {
  return db
    .select({
      id: accReconciliations.id,
      bankAccountId: accReconciliations.bankAccountId,
      bankName: accBankAccounts.name,
      cutoffDate: accReconciliations.cutoffDate,
      statementClosingBalance: accReconciliations.statementClosingBalance,
      bookBalance: accReconciliations.bookBalance,
      status: accReconciliations.status,
      completedAt: accReconciliations.completedAt,
      voidReason: accReconciliations.voidReason,
    })
    .from(accReconciliations)
    .innerJoin(accBankAccounts, eq(accBankAccounts.id, accReconciliations.bankAccountId))
    .where(bankAccountId ? eq(accReconciliations.bankAccountId, bankAccountId) : undefined)
    .orderBy(desc(accReconciliations.cutoffDate), desc(accReconciliations.completedAt));
}

export async function getReconciliation(id: string) {
  const [rec] = await db
    .select()
    .from(accReconciliations)
    .where(eq(accReconciliations.id, id));
  if (!rec) return null;
  const [bank] = await db.select().from(accBankAccounts).where(eq(accBankAccounts.id, rec.bankAccountId));
  return { ...rec, bankName: bank?.name ?? "", snapshot: rec.snapshot as ReconSnapshot };
}

export interface ReconSnapshot {
  report: ReconWorkspace["report"];
  confirmed: ReconWorkspace["confirmed"];
  outstandingBook: WsBookLine[];
  unrecordedStatement: WsStatementLine[];
  adjustments: ReconWorkspace["adjustments"];
  acceptedUnrecorded: boolean;
}

export const unmatchedStatementCount = async (bankAccountId: string) =>
  num(
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(accStatementLines)
        .where(and(eq(accStatementLines.bankAccountId, bankAccountId), isNull(accStatementLines.matchId)))
    )[0].n
  );
