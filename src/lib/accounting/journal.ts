import { and, asc, desc, eq, gte, lte, sql, inArray, or, ilike } from "drizzle-orm";
import { db } from "@/db";
import {
  accEntries,
  accLines,
  accAccounts,
  accParties,
  accPeriods,
  accAttachments,
  accAudit,
} from "@/db/accounting-schema";
import {
  AccError,
  audit,
  clean,
  cleanOrNull,
  fail,
  isIsoDate,
  todayIso,
  transaction,
  type DbLike,
  type Issue,
  type Tx,
} from "./core";
import { listAccounts } from "./masterdata";

export interface LineInput {
  accountId: string;
  partyId?: string | null;
  debit: number;
  credit: number;
  description?: string | null;
}
export interface EntryInput {
  date: string;
  description: string;
  reference?: string | null;
  kind?: string;
  lines: LineInput[];
  /** client-generated key; a repeated submission returns the first result instead of a second entry */
  idempotencyKey?: string | null;
}

export const USER_KINDS = ["manual", "opening"];

const isAmount = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** Returns the period issue for a date, or null when the date is in an open period. */
export async function periodIssue(tx: DbLike, date: string, field = "date"): Promise<Issue | null> {
  const [p] = await tx
    .select()
    .from(accPeriods)
    .where(and(lte(accPeriods.startDate, date), gte(accPeriods.endDate, date)));
  if (!p)
    return {
      field,
      message: `No accounting period covers ${date}. Add a fiscal year in Settings first.`,
    };
  if (p.isLocked)
    return { field, message: `Period ${p.name} is locked. Choose a date in an open period.` };
  return null;
}

/**
 * The single validation path for every journal entry (manual, quick transaction,
 * reversal, adjustment, closing). `posting` adds the rules a posted entry must satisfy.
 */
export async function validateEntry(
  tx: DbLike,
  input: EntryInput,
  opts: { posting: boolean; allowInactive?: boolean }
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (!isIsoDate(input.date)) add("date", "Enter a valid date.");
  const lines = input.lines ?? [];
  const accounts = new Map((await listAccounts(tx)).map((a) => [a.id, a]));
  const partyIds = [...new Set(lines.map((l) => l.partyId).filter(Boolean))] as string[];
  const parties = new Map(
    partyIds.length
      ? (await tx.select().from(accParties).where(inArray(accParties.id, partyIds))).map((p) => [
          p.id,
          p,
        ])
      : []
  );

  let debit = 0;
  let credit = 0;
  lines.forEach((l, i) => {
    const f = `lines.${i}`;
    const account = accounts.get(l.accountId);
    if (!isAmount(l.debit) || !isAmount(l.credit)) {
      add(`${f}.amount`, "Amounts must be whole minor units, zero or more.");
      return;
    }
    if (l.debit > 0 && l.credit > 0)
      add(`${f}.amount`, "A line has either a debit or a credit, not both.");
    debit += l.debit;
    credit += l.credit;
    if (!account) add(`${f}.accountId`, "Choose an account.");
    if (l.partyId && !parties.has(l.partyId)) add(`${f}.partyId`, "Party not found.");

    if (!opts.posting) return;
    if (l.debit === 0 && l.credit === 0)
      add(`${f}.amount`, "Enter a debit or a credit amount.");
    if (account) {
      if (!account.postable)
        add(`${f}.accountId`, `${account.code} is a summary account; post to one of its sub-accounts.`);
      else if (!account.isActive && !opts.allowInactive)
        add(`${f}.accountId`, `${account.code} is inactive.`);
      if (account.requiresParty && !l.partyId)
        add(`${f}.partyId`, `${account.code} ${account.name} needs a party.`);
    }
    const party = l.partyId ? parties.get(l.partyId) : undefined;
    if (party && !party.isActive && !opts.allowInactive)
      add(`${f}.partyId`, `${party.name} is inactive.`);
  });

  if (opts.posting) {
    if (!clean(input.description)) add("description", "Description is required.");
    if (lines.length < 2) add("lines", "An entry needs at least two lines.");
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit))
      add("lines", "Totals are too large.");
    else if (debit !== credit)
      add("lines", "Total debits must equal total credits.");
    if (isIsoDate(input.date)) {
      const p = await periodIssue(tx, input.date);
      if (p) issues.push(p);
    }
  }
  return issues;
}

function throwIfIssues(issues: Issue[]) {
  if (issues.length) throw new AccError(issues[0].message, issues);
}

async function insertLines(tx: Tx, entryId: string, lines: LineInput[]) {
  if (!lines.length) return;
  await tx.insert(accLines).values(
    lines.map((l, i) => ({
      entryId,
      lineNo: i + 1,
      accountId: l.accountId,
      partyId: l.partyId || null,
      debit: l.debit,
      credit: l.credit,
      description: cleanOrNull(l.description),
    }))
  );
}

async function loadInput(tx: DbLike, id: string) {
  const [entry] = await tx.select().from(accEntries).where(eq(accEntries.id, id));
  if (!entry) fail("Journal entry not found.");
  const lines = await tx
    .select()
    .from(accLines)
    .where(eq(accLines.entryId, id))
    .orderBy(asc(accLines.lineNo));
  return { entry, lines };
}

export const entryNumberFor = (seq: number) => `JE-${String(seq).padStart(6, "0")}`;

/** Posts a draft inside an existing transaction. */
export async function postEntryTx(
  tx: Tx,
  id: string,
  opts: { allowInactive?: boolean; allowClosedKind?: boolean } = {}
) {
  const { entry, lines } = await loadInput(tx, id);
  if (entry.status === "posted") fail("This entry is already posted.");
  throwIfIssues(
    await validateEntry(
      tx,
      { date: entry.date, description: entry.description, lines },
      { posting: true, allowInactive: opts.allowInactive }
    )
  );
  // ponytail: max+1 numbering is fine for one user; the unique constraint rejects a clash under concurrency
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${accEntries.seq}), 0) + 1` })
    .from(accEntries);
  const seq = Number(next);
  const entryNumber = entryNumberFor(seq);
  await tx
    .update(accEntries)
    .set({ status: "posted", seq, entryNumber, postedAt: new Date(), updatedAt: new Date() })
    .where(eq(accEntries.id, id));
  const total = lines.reduce((s, l) => s + l.debit, 0);
  await audit(tx, "entry.posted", "entry", id, `Posted ${entryNumber}`, {
    date: entry.date,
    total,
    kind: entry.kind,
  });
  return { id, entryNumber };
}

export async function createEntryTx(
  tx: Tx,
  input: EntryInput,
  opts: { post?: boolean; allowInactive?: boolean; reversesEntryId?: string } = {}
): Promise<{ id: string; entryNumber: string | null; duplicate?: boolean }> {
  const key = cleanOrNull(input.idempotencyKey);
  if (key) {
    const [existing] = await tx.select().from(accEntries).where(eq(accEntries.idempotencyKey, key));
    if (existing) return { id: existing.id, entryNumber: existing.entryNumber, duplicate: true };
  }
  throwIfIssues(await validateEntry(tx, input, { posting: false }));
  const [row] = await tx
    .insert(accEntries)
    .values({
      date: input.date,
      description: clean(input.description),
      reference: cleanOrNull(input.reference),
      kind: input.kind ?? "manual",
      idempotencyKey: key,
      reversesEntryId: opts.reversesEntryId ?? null,
    })
    .returning({ id: accEntries.id });
  await insertLines(tx, row.id, input.lines);
  await audit(tx, "entry.created", "entry", row.id, "Created draft entry", {
    kind: input.kind ?? "manual",
  });
  if (!opts.post) return { id: row.id, entryNumber: null };
  return postEntryTx(tx, row.id, { allowInactive: opts.allowInactive });
}

/** Saves an entry and its lines atomically; with `post` it is validated and posted in the same transaction. */
export function createEntry(input: EntryInput, opts: { post?: boolean } = {}) {
  if (input.kind && !USER_KINDS.includes(input.kind)) input = { ...input, kind: "manual" };
  return transaction((tx) => createEntryTx(tx, input, opts));
}

export function updateDraft(id: string, input: EntryInput, opts: { post?: boolean } = {}) {
  return transaction(async (tx) => {
    const { entry, lines: before } = await loadInput(tx, id);
    if (entry.status !== "draft")
      fail("Posted entries cannot be edited. Reverse the entry and post a replacement.");
    throwIfIssues(await validateEntry(tx, input, { posting: false }));
    await tx
      .update(accEntries)
      .set({
        date: input.date,
        description: clean(input.description),
        reference: cleanOrNull(input.reference),
        kind: USER_KINDS.includes(input.kind ?? "") ? input.kind! : entry.kind,
        updatedAt: new Date(),
      })
      .where(eq(accEntries.id, id));
    await tx.delete(accLines).where(eq(accLines.entryId, id));
    await insertLines(tx, id, input.lines);
    await audit(tx, "entry.updated", "entry", id, "Edited draft entry", {
      before: {
        date: entry.date,
        description: entry.description,
        lines: before.map((l) => ({
          accountId: l.accountId,
          partyId: l.partyId,
          debit: l.debit,
          credit: l.credit,
        })),
      },
    });
    if (opts.post) return postEntryTx(tx, id);
    return { id, entryNumber: null as string | null };
  });
}

export const postEntry = (id: string) => transaction((tx) => postEntryTx(tx, id));

export function deleteDraft(id: string) {
  return transaction(async (tx) => {
    const { entry } = await loadInput(tx, id);
    if (entry.status !== "draft")
      fail("Posted entries cannot be deleted. Reverse the entry instead.");
    await tx.delete(accEntries).where(eq(accEntries.id, id));
    await audit(tx, "entry.deleted", "entry", id, "Deleted draft entry", {
      date: entry.date,
      description: entry.description,
    });
  });
}

/** Copies any entry into a new draft dated today. */
export function duplicateEntry(id: string) {
  return transaction(async (tx) => {
    const { entry, lines } = await loadInput(tx, id);
    return createEntryTx(tx, {
      date: todayIso(),
      description: entry.description,
      reference: entry.reference,
      kind: USER_KINDS.includes(entry.kind) ? entry.kind : "manual",
      lines,
    });
  });
}

export async function reverseEntryTx(
  tx: Tx,
  id: string,
  opts: { date: string; description?: string; allowClosing?: boolean }
) {
  const { entry, lines } = await loadInput(tx, id);
  if (entry.status !== "posted") fail("Only posted entries can be reversed.");
  if (entry.reversedByEntryId) fail("This entry has already been reversed.");
  if (entry.kind === "closing" && !opts.allowClosing)
    fail("Year-end closing entries are reversed by reopening the fiscal year in Settings.");
  if (!isIsoDate(opts.date)) fail("Enter a valid reversal date.", "date");
  const result = await createEntryTx(
    tx,
    {
      date: opts.date,
      description: clean(opts.description) || `Reversal of ${entry.entryNumber}: ${entry.description}`,
      reference: entry.reference,
      kind: entry.kind === "closing" ? "closing" : "reversal",
      lines: lines.map((l) => ({
        accountId: l.accountId,
        partyId: l.partyId,
        debit: l.credit,
        credit: l.debit,
        description: l.description,
      })),
    },
    // the original accounts may have been deactivated since; a reversal must still be possible
    { post: true, allowInactive: true, reversesEntryId: id }
  );
  await tx
    .update(accEntries)
    .set({ reversedByEntryId: result.id, updatedAt: new Date() })
    .where(eq(accEntries.id, id));
  await audit(
    tx,
    "entry.reversed",
    "entry",
    id,
    `Reversed ${entry.entryNumber} with ${result.entryNumber}`,
    { reversalId: result.id, reversalDate: opts.date }
  );
  return result;
}

/** Reverses a posted entry with a linked, opposite entry. The original stays in the books. */
export const reverseEntry = (id: string, opts: { date: string; description?: string }) =>
  transaction((tx) => reverseEntryTx(tx, id, opts));

// ------------------------------------------------------------------- reading
export async function getEntry(id: string) {
  const [entry] = await db.select().from(accEntries).where(eq(accEntries.id, id));
  if (!entry) return null;
  const [lines, attachments, history, linked] = await Promise.all([
    db
      .select({
        id: accLines.id,
        lineNo: accLines.lineNo,
        accountId: accLines.accountId,
        accountCode: accAccounts.code,
        accountName: accAccounts.name,
        partyId: accLines.partyId,
        partyName: accParties.name,
        debit: accLines.debit,
        credit: accLines.credit,
        description: accLines.description,
      })
      .from(accLines)
      .innerJoin(accAccounts, eq(accAccounts.id, accLines.accountId))
      .leftJoin(accParties, eq(accParties.id, accLines.partyId))
      .where(eq(accLines.entryId, id))
      .orderBy(asc(accLines.lineNo)),
    db
      .select({
        id: accAttachments.id,
        filename: accAttachments.filename,
        mimeType: accAttachments.mimeType,
        size: accAttachments.size,
        createdAt: accAttachments.createdAt,
      })
      .from(accAttachments)
      .where(eq(accAttachments.entryId, id))
      .orderBy(asc(accAttachments.createdAt)),
    db
      .select()
      .from(accAudit)
      .where(and(eq(accAudit.entityType, "entry"), eq(accAudit.entityId, id)))
      .orderBy(asc(accAudit.at)),
    db
      .select({ id: accEntries.id, entryNumber: accEntries.entryNumber, date: accEntries.date })
      .from(accEntries)
      .where(
        inArray(
          accEntries.id,
          [entry.reversesEntryId, entry.reversedByEntryId].filter(Boolean) as string[]
        )
      ),
  ]);
  return {
    ...entry,
    lines,
    attachments,
    history,
    reverses: linked.find((l) => l.id === entry.reversesEntryId) ?? null,
    reversedBy: linked.find((l) => l.id === entry.reversedByEntryId) ?? null,
  };
}
export type EntryDetail = NonNullable<Awaited<ReturnType<typeof getEntry>>>;

export interface EntryFilters {
  q?: string;
  status?: string; // draft | posted | reversed
  from?: string;
  to?: string;
  kind?: string;
}

export async function listEntries(f: EntryFilters = {}) {
  const where = [];
  if (f.status === "draft") where.push(eq(accEntries.status, "draft"));
  if (f.status === "posted")
    where.push(eq(accEntries.status, "posted"), sql`${accEntries.reversedByEntryId} is null`);
  if (f.status === "reversed") where.push(sql`${accEntries.reversedByEntryId} is not null`);
  if (isIsoDate(f.from)) where.push(gte(accEntries.date, f.from));
  if (isIsoDate(f.to)) where.push(lte(accEntries.date, f.to));
  if (f.kind) where.push(eq(accEntries.kind, f.kind));
  const q = clean(f.q);
  if (q) {
    const like = `%${q}%`;
    where.push(
      or(
        ilike(accEntries.description, like),
        ilike(accEntries.entryNumber, like),
        ilike(accEntries.reference, like),
        sql`exists (select 1 from acc_lines l
              join acc_accounts a on a.id = l.account_id
              left join acc_parties p on p.id = l.party_id
             where l.entry_id = acc_entries.id
               and (a.name ilike ${like} or a.code ilike ${like} or p.name ilike ${like} or l.description ilike ${like}))`
      )!
    );
  }
  return db
    .select({
      id: accEntries.id,
      entryNumber: accEntries.entryNumber,
      date: accEntries.date,
      description: accEntries.description,
      reference: accEntries.reference,
      status: accEntries.status,
      kind: accEntries.kind,
      reversedByEntryId: accEntries.reversedByEntryId,
      reversesEntryId: accEntries.reversesEntryId,
      // subqueries name the outer table explicitly: a bare "id" would bind to the inner table
      total: sql<number>`coalesce((select sum(debit) from acc_lines l where l.entry_id = acc_entries.id), 0)`,
      lineCount: sql<number>`(select count(*) from acc_lines l where l.entry_id = acc_entries.id)`,
      attachmentCount: sql<number>`(select count(*) from acc_attachments t where t.entry_id = acc_entries.id)`,
    })
    .from(accEntries)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(accEntries.date), sql`${accEntries.seq} desc nulls first`, desc(accEntries.createdAt))
    .limit(500);
}

// --------------------------------------------------------------- attachments
const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export async function addAttachment(entryId: string, filename: string, bytes: Uint8Array) {
  // keep only a plain file name; the type is decided by our whitelist, never by the upload
  const safeName = clean(filename).replace(/^.*[\\/]/, "").replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = ALLOWED_TYPES[ext];
  if (!mimeType) fail("Allowed attachment types: PDF, PNG, JPG, WEBP, TXT, CSV, XLSX.");
  if (!bytes.length) fail("The file is empty.");
  if (bytes.length > MAX_ATTACHMENT_BYTES) fail("Attachments are limited to 5 MB.");
  return transaction(async (tx) => {
    const [entry] = await tx.select().from(accEntries).where(eq(accEntries.id, entryId));
    if (!entry) fail("Journal entry not found.");
    const [row] = await tx
      .insert(accAttachments)
      .values({
        entryId,
        filename: safeName,
        mimeType,
        size: bytes.length,
        data: Buffer.from(bytes).toString("base64"),
      })
      .returning({ id: accAttachments.id });
    await audit(tx, "attachment.added", "entry", entryId, `Attached ${safeName}`);
    return row.id;
  });
}

export function deleteAttachment(id: string) {
  return transaction(async (tx) => {
    const [a] = await tx
      .select({ id: accAttachments.id, entryId: accAttachments.entryId, filename: accAttachments.filename })
      .from(accAttachments)
      .where(eq(accAttachments.id, id));
    if (!a) fail("Attachment not found.");
    await tx.delete(accAttachments).where(eq(accAttachments.id, id));
    await audit(tx, "attachment.removed", "entry", a.entryId, `Removed attachment ${a.filename}`);
  });
}

export async function getAttachment(id: string) {
  const [a] = await db.select().from(accAttachments).where(eq(accAttachments.id, id));
  return a ?? null;
}
