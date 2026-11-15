import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  date,
  timestamp,
  jsonb,
  unique,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Money is stored as integer minor units (bigint). Never floats.
// ponytail: JS numbers are exact up to 2^53 (~9e15 minor units); switch to BigInt mode if a ledger ever exceeds that.
const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const accCategoryEnum = pgEnum("acc_category", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);
export const accEntryStatusEnum = pgEnum("acc_entry_status", ["draft", "posted"]);

export const accAccounts = pgTable("acc_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: accCategoryEnum("category").notNull(),
  parentId: uuid("parent_id").references((): AnyPgColumn => accAccounts.id, {
    onDelete: "restrict",
  }),
  isActive: boolean("is_active").notNull().default(true),
  isPosting: boolean("is_posting").notNull().default(true),
  requiresParty: boolean("requires_party").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const accSettings = pgTable(
  "acc_settings",
  {
    id: integer("id").primaryKey().default(1),
    businessName: text("business_name").notNull().default("My Business"),
    currencyCode: text("currency_code").notNull().default("IRR"),
    currencyLabel: text("currency_label").notNull().default("Rial"),
    decimals: integer("decimals").notNull().default(0),
    retainedEarningsAccountId: uuid("retained_earnings_account_id").references(
      () => accAccounts.id,
      { onDelete: "restrict" }
    ),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    check("acc_settings_singleton", sql`${t.id} = 1`),
    check("acc_settings_decimals", sql`${t.decimals} between 0 and 4`),
  ]
);

export const accParties = pgTable("acc_parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  code: text("code").unique(),
  notes: text("notes"),
  isCustomer: boolean("is_customer").notNull().default(false),
  isSupplier: boolean("is_supplier").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const accFiscalYears = pgTable(
  "acc_fiscal_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isClosed: boolean("is_closed").notNull().default(false),
    closingEntryId: uuid("closing_entry_id").references(
      (): AnyPgColumn => accEntries.id,
      { onDelete: "set null" }
    ),
  },
  (t) => [check("acc_fy_range", sql`${t.startDate} <= ${t.endDate}`)]
);

export const accPeriods = pgTable(
  "acc_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => accFiscalYears.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isLocked: boolean("is_locked").notNull().default(false),
  },
  (t) => [check("acc_period_range", sql`${t.startDate} <= ${t.endDate}`)]
);

export const accEntries = pgTable(
  "acc_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // seq / entryNumber are assigned when the entry is posted
    seq: integer("seq").unique(),
    entryNumber: text("entry_number").unique(),
    date: date("date").notNull(),
    description: text("description").notNull().default(""),
    reference: text("reference"),
    status: accEntryStatusEnum("status").notNull().default("draft"),
    // manual | opening | receipt | payment | expense | transfer | reversal | adjustment | closing
    kind: text("kind").notNull().default("manual"),
    reversesEntryId: uuid("reverses_entry_id").references(
      (): AnyPgColumn => accEntries.id,
      { onDelete: "restrict" }
    ),
    reversedByEntryId: uuid("reversed_by_entry_id").references(
      (): AnyPgColumn => accEntries.id,
      { onDelete: "restrict" }
    ),
    idempotencyKey: text("idempotency_key").unique(),
    postedAt: ts("posted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("acc_entries_date_idx").on(t.date),
    check(
      "acc_entries_posted_numbered",
      sql`${t.status} = 'draft' or (${t.seq} is not null and ${t.entryNumber} is not null)`
    ),
  ]
);

export const accLines = pgTable(
  "acc_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => accEntries.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accAccounts.id, { onDelete: "restrict" }),
    partyId: uuid("party_id").references(() => accParties.id, {
      onDelete: "restrict",
    }),
    debit: money("debit").notNull().default(0),
    credit: money("credit").notNull().default(0),
    description: text("description"),
  },
  (t) => [
    index("acc_lines_entry_idx").on(t.entryId),
    index("acc_lines_account_idx").on(t.accountId),
    index("acc_lines_party_idx").on(t.partyId),
    check("acc_lines_non_negative", sql`${t.debit} >= 0 and ${t.credit} >= 0`),
    // drafts may hold incomplete lines; the posting trigger enforces exactly one positive side
    check("acc_lines_one_sided", sql`${t.debit} = 0 or ${t.credit} = 0`),
  ]
);

export const accAttachments = pgTable("acc_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id")
    .notNull()
    .references(() => accEntries.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  // ponytail: base64 in the database so one backup file covers attachments; move to disk/object storage if files get large
  data: text("data").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const accAudit = pgTable(
  "acc_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: ts("at").notNull().defaultNow(),
    actor: text("actor"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    detail: jsonb("detail"),
  },
  (t) => [index("acc_audit_entity_idx").on(t.entityType, t.entityId)]
);

export const accBankAccounts = pgTable(
  "acc_bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("bank"),
    accountId: uuid("account_id")
      .notNull()
      .unique()
      .references(() => accAccounts.id, { onDelete: "restrict" }),
    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [check("acc_bank_kind", sql`${t.kind} in ('bank','cash')`)]
);

export const accReconciliations = pgTable("acc_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => accBankAccounts.id, { onDelete: "restrict" }),
  cutoffDate: date("cutoff_date").notNull(),
  statementClosingBalance: money("statement_closing_balance").notNull(),
  bookBalance: money("book_balance").notNull(),
  status: text("status").notNull().default("completed"), // completed | voided
  snapshot: jsonb("snapshot").notNull(),
  completedAt: ts("completed_at").notNull().defaultNow(),
  voidedAt: ts("voided_at"),
  voidReason: text("void_reason"),
});

export const accReconMatches = pgTable("acc_recon_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => accBankAccounts.id, { onDelete: "restrict" }),
  reconciliationId: uuid("reconciliation_id").references(
    () => accReconciliations.id,
    { onDelete: "set null" }
  ),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// A journal line can sit in at most one match (primary key).
export const accReconMatchLines = pgTable("acc_recon_match_lines", {
  journalLineId: uuid("journal_line_id")
    .primaryKey()
    .references(() => accLines.id, { onDelete: "restrict" }),
  matchId: uuid("match_id")
    .notNull()
    .references(() => accReconMatches.id, { onDelete: "cascade" }),
});

export const accStatementImports = pgTable(
  "acc_statement_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => accBankAccounts.id, { onDelete: "restrict" }),
    filename: text("filename").notNull(),
    fileHash: text("file_hash").notNull(),
    rowCount: integer("row_count").notNull(),
    openingBalance: money("opening_balance"),
    closingBalance: money("closing_balance"),
    fromDate: date("from_date"),
    toDate: date("to_date"),
    importedAt: ts("imported_at").notNull().defaultNow(),
  },
  (t) => [unique("acc_import_file_once").on(t.bankAccountId, t.fileHash)]
);

// Statement data lives apart from the books. amount > 0 = money into the account (deposit),
// amount < 0 = money out (withdrawal). A statement line can sit in at most one match (matchId).
export const accStatementLines = pgTable(
  "acc_statement_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => accStatementImports.id, { onDelete: "cascade" }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => accBankAccounts.id, { onDelete: "restrict" }),
    lineNo: integer("line_no").notNull(),
    date: date("date").notNull(),
    description: text("description").notNull().default(""),
    reference: text("reference"),
    externalId: text("external_id"),
    amount: money("amount").notNull(),
    runningBalance: money("running_balance"),
    isOpening: boolean("is_opening").notNull().default(false),
    duplicateFlag: boolean("duplicate_flag").notNull().default(false),
    matchId: uuid("match_id").references(() => accReconMatches.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("acc_stmt_external_once").on(t.bankAccountId, t.externalId),
    index("acc_stmt_bank_date_idx").on(t.bankAccountId, t.date),
  ]
);

export type AccAccount = typeof accAccounts.$inferSelect;
export type AccParty = typeof accParties.$inferSelect;
export type AccEntry = typeof accEntries.$inferSelect;
export type AccLine = typeof accLines.$inferSelect;
export type AccSettings = typeof accSettings.$inferSelect;
export type AccFiscalYear = typeof accFiscalYears.$inferSelect;
export type AccPeriod = typeof accPeriods.$inferSelect;
export type AccBankAccount = typeof accBankAccounts.$inferSelect;
export type AccStatementLine = typeof accStatementLines.$inferSelect;
export type AccStatementImport = typeof accStatementImports.$inferSelect;
export type AccReconciliation = typeof accReconciliations.$inferSelect;
export type AccAttachment = typeof accAttachments.$inferSelect;
export type AccAuditRow = typeof accAudit.$inferSelect;
export type AccCategory = AccAccount["category"];
