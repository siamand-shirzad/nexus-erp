import { createHash } from "node:crypto";
import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import * as s from "@/db/accounting-schema";
import { AccError, audit, transaction } from "./core";

// Backup = one JSON file with every accounting table, attachments included (base64).
// Order matters for restore (parents before children).
const TABLES = {
  accounts: s.accAccounts,
  parties: s.accParties,
  settings: s.accSettings,
  entries: s.accEntries,
  lines: s.accLines,
  attachments: s.accAttachments,
  fiscalYears: s.accFiscalYears,
  periods: s.accPeriods,
  bankAccounts: s.accBankAccounts,
  reconciliations: s.accReconciliations,
  reconMatches: s.accReconMatches,
  reconMatchLines: s.accReconMatchLines,
  statementImports: s.accStatementImports,
  statementLines: s.accStatementLines,
  audit: s.accAudit,
} satisfies Record<string, PgTable>;
type TableName = keyof typeof TABLES;
type Row = Record<string, unknown>;

export const BACKUP_FORMAT = "nexus-accounting-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: string;
  version: number;
  createdAt: string;
  checksum: string;
  tables: Record<TableName, Row[]>;
}

const checksumOf = (tables: unknown) =>
  createHash("sha256").update(JSON.stringify(tables)).digest("hex");

export async function createBackup(): Promise<BackupFile> {
  const tables = {} as Record<TableName, Row[]>;
  await transaction(async (tx) => {
    for (const name of Object.keys(TABLES) as TableName[])
      tables[name] = (await tx.select().from(TABLES[name] as PgTable)) as Row[];
  });
  // round-trip through JSON so the checksum is computed on exactly what is written to the file
  const plain = JSON.parse(JSON.stringify(tables));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    checksum: checksumOf(plain),
    tables: plain,
  };
}

/** Checks a backup completely before anything is replaced. Returns a summary or throws AccError. */
export function validateBackup(data: unknown) {
  const problems: string[] = [];
  const b = data as BackupFile;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT)
    throw new AccError("This is not an accounting backup file.");
  if (b.version !== BACKUP_VERSION)
    throw new AccError(`Unsupported backup version ${b.version}.`);
  for (const name of Object.keys(TABLES) as TableName[])
    if (!Array.isArray(b.tables?.[name])) problems.push(`table "${name}" is missing`);
  if (problems.length) throw new AccError(`Backup is incomplete: ${problems.join(", ")}.`);
  if (checksumOf(b.tables) !== b.checksum)
    throw new AccError("Backup checksum does not match; the file is damaged or was edited.");

  const t = b.tables;
  if (t.settings.length !== 1) problems.push("expected exactly one settings row");
  const ids = (rows: Row[]) => new Set(rows.map((r) => r.id));
  const accountIds = ids(t.accounts);
  const partyIds = ids(t.parties);
  const entryIds = ids(t.entries);
  const byEntry = new Map<unknown, Row[]>();
  for (const l of t.lines) {
    if (!entryIds.has(l.entryId)) problems.push(`a line refers to a missing entry`);
    if (!accountIds.has(l.accountId)) problems.push(`a line refers to a missing account`);
    if (l.partyId && !partyIds.has(l.partyId)) problems.push(`a line refers to a missing party`);
    byEntry.set(l.entryId, [...(byEntry.get(l.entryId) ?? []), l]);
  }
  for (const e of t.entries) {
    if (e.status !== "posted") continue;
    const lines = byEntry.get(e.id) ?? [];
    let debit = 0;
    let credit = 0;
    let bad = lines.length < 2;
    for (const l of lines) {
      const d = Number(l.debit);
      const c = Number(l.credit);
      if (!Number.isSafeInteger(d) || !Number.isSafeInteger(c) || !((d > 0 && c === 0) || (c > 0 && d === 0)))
        bad = true;
      debit += d;
      credit += c;
    }
    if (bad || debit !== credit) problems.push(`posted entry ${e.entryNumber} is not a valid balanced entry`);
  }
  for (const a of t.attachments)
    if (!entryIds.has(a.entryId)) problems.push("an attachment refers to a missing entry");
  if (problems.length)
    throw new AccError(`Backup failed validation: ${[...new Set(problems)].slice(0, 5).join("; ")}.`);
  return {
    createdAt: b.createdAt,
    entries: t.entries.length,
    lines: t.lines.length,
    accounts: t.accounts.length,
    parties: t.parties.length,
    attachments: t.attachments.length,
    statementLines: t.statementLines.length,
  };
}

/** JSON gives timestamps back as strings; turn them into Dates for timestamp columns. */
function revive(table: PgTable, row: Row): Row {
  const out: Row = { ...row };
  for (const [key, col] of Object.entries(getTableColumns(table)))
    if (col.dataType === "date" && typeof out[key] === "string") out[key] = new Date(out[key] as string);
  return out;
}

async function insertAll(tx: Parameters<Parameters<typeof transaction>[0]>[0], table: PgTable, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 200)
    await tx.insert(table).values(rows.slice(i, i + 200).map((r) => revive(table, r)) as never);
}

/**
 * Replaces all accounting data with the backup. The file is validated first, and the
 * replacement runs in one transaction, so a failure leaves the existing data untouched.
 */
export async function restoreBackup(data: unknown) {
  const summary = validateBackup(data);
  const t = (data as BackupFile).tables;
  await transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE TABLE
      acc_recon_match_lines, acc_statement_lines, acc_statement_imports, acc_recon_matches,
      acc_reconciliations, acc_attachments, acc_lines, acc_entries, acc_periods, acc_fiscal_years,
      acc_bank_accounts, acc_settings, acc_parties, acc_accounts, acc_audit CASCADE`);

    // self- and forward-references are filled in after the rows exist
    await insertAll(tx, s.accAccounts, t.accounts.map((a) => ({ ...a, parentId: null })));
    for (const a of t.accounts)
      if (a.parentId)
        await tx.update(s.accAccounts).set({ parentId: a.parentId as string }).where(eq(s.accAccounts.id, a.id as string));
    await insertAll(tx, s.accParties, t.parties);
    await insertAll(tx, s.accSettings, t.settings);

    // Entries go in as drafts, then their lines, then they are posted again: the database
    // posting trigger re-checks every entry, so an unbalanced backup cannot be restored.
    await insertAll(
      tx,
      s.accEntries,
      t.entries.map((e) => ({ ...e, status: "draft", reversesEntryId: null, reversedByEntryId: null }))
    );
    await insertAll(tx, s.accLines, t.lines);
    const posted = t.entries.filter((e) => e.status === "posted").map((e) => e.id as string);
    for (let i = 0; i < posted.length; i += 200)
      await tx.update(s.accEntries).set({ status: "posted" }).where(inArray(s.accEntries.id, posted.slice(i, i + 200)));
    for (const e of t.entries)
      if (e.reversesEntryId || e.reversedByEntryId)
        await tx
          .update(s.accEntries)
          .set({
            reversesEntryId: (e.reversesEntryId as string) ?? null,
            reversedByEntryId: (e.reversedByEntryId as string) ?? null,
          })
          .where(eq(s.accEntries.id, e.id as string));

    await insertAll(tx, s.accAttachments, t.attachments);
    await insertAll(tx, s.accFiscalYears, t.fiscalYears);
    await insertAll(tx, s.accPeriods, t.periods);
    await insertAll(tx, s.accBankAccounts, t.bankAccounts);
    await insertAll(tx, s.accReconciliations, t.reconciliations);
    await insertAll(tx, s.accReconMatches, t.reconMatches);
    await insertAll(tx, s.accReconMatchLines, t.reconMatchLines);
    await insertAll(tx, s.accStatementImports, t.statementImports);
    await insertAll(tx, s.accStatementLines, t.statementLines);
    await insertAll(tx, s.accAudit, t.audit);
    await audit(tx, "backup.restored", "settings", null, `Restored backup created ${summary.createdAt}`, summary);
  });
  return summary;
}
