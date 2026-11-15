# Nexus ERP with Accounting

A small-business web application: double-entry accounting (books, ledgers, receivables and
payables, bank reconciliation, financial reports) alongside the original sales and operations
screens (orders, invoices, customers, products, tasks, team).

Stack: Next.js 16, React 19, TypeScript, Tailwind 4, Drizzle ORM on PostgreSQL.
By default the database is an embedded PostgreSQL (PGlite) stored in `./data/pgdata`, so
nothing else needs to be installed. A real PostgreSQL server can be used instead.

## Setup and run

Requires Node.js 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://127.0.0.1:3000. The server binds to localhost only.

On first start the app creates the database, applies the SQL migrations in `drizzle/`,
seeds the sales demo workspace with its user accounts, and installs empty books with a
starter chart of accounts, three bank/cash accounts and the current fiscal year.

For a production-style run:

```bash
npm run build
```

```bash
npm run start
```

### Signing in

The login screen lists the seeded demo accounts. Sign in as the **Administrator**: the
accounting module is available to the administrator account only (other roles are sent back
to the sales dashboard and receive no accounting data).

Before entering real records, change the administrator password under **Account → Profile**
and set your own `NEXUS_SECRET` in `.env` (see `.env.example`).

### Using a real PostgreSQL server (optional)

Set `DATABASE_URL` in `.env`, for example
`postgresql://user:password@127.0.0.1:5432/app_db`. Migrations are applied automatically at
start. The embedded database is single-process; use a server if you ever run more than one
app process.

## The accounting module

Navigation: Dashboard, Journal Entries, Quick Transactions, Chart of Accounts, Parties,
Bank & Cash, Reconciliation, Reports, Settings.

| Area | What it does |
|---|---|
| Journal Entries | Create, edit and delete drafts; post; duplicate; reverse with a linked entry; attach documents; search and filter. |
| Quick Transactions | Money received, money paid, expense payment, transfer. Each posts one balanced journal entry through the same validation as manual entries. |
| Chart of Accounts | Hierarchy of summary and posting accounts in five categories, with party-required control accounts. Used accounts are deactivated, not deleted. |
| Parties | Customers, suppliers and others. Receivable and payable balances are kept separate; each party has an exportable statement. |
| Bank & Cash | Bank and cash accounts linked to ledger accounts, their balances, movements, statement imports and reconciliation history. |
| Reconciliation | CSV/XLSX statement import with explicit column, date-format and sign mapping; match suggestions; manual one-to-one and grouped matches; reviewed adjusting entries; reconciliation report and history. |
| Reports | Account ledger, general ledger, general journal, trial balance, income statement, balance sheet, receivables and payables by party, bank and cash movements. Excel export and print/PDF. |
| Settings | Currency and precision, fiscal years, period locks, year-end closing, backup and restore, demo data, audit log. |

### Rules the books enforce

- Money is stored as whole minor units (integers). No floating-point arithmetic is used.
- One base currency with a fixed precision and display unit. They lock once the first amount
  is recorded, so amounts can never be silently reinterpreted (for example rial vs toman).
  The default is IRR (Rial) with 0 decimals; change it in Settings before the first entry.
- A posted entry has a unique number, at least two lines, equal debits and credits, active
  posting accounts, required parties, and a date inside an open period.
- These rules are checked in the application and again by database triggers
  (`drizzle/0001_accounting_guards.sql`): a posted entry cannot be edited or deleted, and an
  unbalanced entry cannot be posted even with direct SQL.
- Balances are always derived from posted lines; there is no stored balance to drift.
- Sign convention: a balance is debits minus credits. It is shown as an amount with
  **Dr** (debit balance) or **Cr** (credit balance).
- Ledger rows are ordered by date, then posting number, then line number.
- Bank statement lines are stored apart from journal entries. Importing never posts anything.
  A statement amount is positive for money in and negative for money out.

## Demo dataset and sample files

**Accounting → Settings → Load demo data** fills empty books with a fictional January 2026
dataset: opening balances, a receivable with a partial collection, a payable with a partial
payment, an expense, a bank transfer, and an imported statement for the main bank account
that contains a fee the books lack, misses an uncashed cheque, and has two same-amount
transactions that need a decision. Try reconciling **Main Bank Account** at cutoff
**2026-01-31** (the closing balance is offered from the import).

Demo data can only be loaded into empty books, shows a banner on every screen, and is removed
as a whole with **Clear demo data**. It never mixes with real records.

Sample statement files are in `samples/`:

| File | Layout |
|---|---|
| `demo-bank-statement.csv` | Separate withdrawal and deposit columns, `YYYY-MM-DD` dates, bank transaction ids, running balance. Already imported by the demo. |
| `savings-statement-january.xlsx` | One signed amount column (positive = deposit), `DD/MM/YYYY` dates, running balance. Import it into **Savings Account** to try the wizard and record the interest line as an adjusting entry. |

## Backup and restore

**Backup:** Accounting → Settings → **Download backup**. The file is JSON and holds every
accounting record, including attachments, statements, reconciliations and the audit log,
plus a checksum.

**Restore:** Accounting → Settings → choose the backup file. The file is validated first
(format, checksum, references, every posted entry balanced) and a summary is shown. Only
after you confirm is the current accounting data replaced, in a single transaction: if
anything fails, the existing data is left untouched. Entries are re-posted through the
database triggers during restore.

The backup covers the accounting module. To copy the whole embedded database, including the
sales screens and user accounts, stop the app and copy the `data/` folder.

## Checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

`npm test` runs 25 tests against a disposable in-memory database. They cover: rejecting
unbalanced and invalid entries (application and database level), exact money parsing,
duplicate-submission protection, drafts excluded from reports, reversals, locked periods and
logged reopening, ledger opening and running balances, party balances, bank-transfer
treatment, trial balance and balance sheet consistency, account hierarchy rules, statement
import (same file, known transaction ids, look-alike rows, invalid rows, date format and
sign convention, the XLSX sample), ambiguous matching, no reuse of matched transactions,
grouped matches, the full demo reconciliation with an adjusting entry, backup and restore
with a damaged-file check, and year-end closing, reopening and re-closing without duplicate
effects.

The screens were also exercised by hand in a browser against the demo dataset.

## Known limitations

- Dates use the Gregorian calendar only. There is no Jalali (Shamsi) calendar support.
- Single currency. There is no multi-currency or exchange-rate handling.
- The sales screens (orders, invoices, customers, products) are not connected to the books:
  an invoice does not create a journal entry. Record receivables with journal entries.
- Match suggestions are one-to-one. Grouped matches (one-to-many, many-to-one) are made by
  hand. Amount-difference detection relies on a shared reference.
- An entry that mixes an internal transfer with an external receipt or payment is counted
  wholly as external in the cash movement figures.
- Attachments are stored in the database, 5 MB each.
- The journal list shows the 500 most recent matches; the statement-lines panel shows 200.
- PDF output uses the browser's print dialog. Excel exports contain the table on screen.
- Amounts above about 9 quadrillion minor units are not supported.
- Year-end closing requires earlier fiscal years to be closed first.
- There are no automated browser tests; UI checks were manual.
- The seeded accounts use well-known demo passwords. Change them before real use.
