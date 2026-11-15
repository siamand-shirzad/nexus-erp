import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { listEntries } from "@/lib/accounting/journal";
import { getSettings } from "@/lib/accounting/setup";
import { formatAmount } from "@/lib/accounting/money";
import { one, type Params } from "@/lib/accounting/range";
import {
  Empty,
  EntryStatus,
  F,
  KIND_LABEL,
  PageTitle,
  Panel,
  Table,
  btn,
  btnPrimary,
  input,
  linkCls,
  rowCls,
  td,
  tdR,
  th,
  thR,
} from "@/components/accounting/ui";

export default async function JournalPage({ searchParams }: { searchParams: Params }) {
  await requireBooksAccess();
  const p = await searchParams;
  const f = { q: one(p.q), status: one(p.status), from: one(p.from), to: one(p.to), kind: one(p.kind) };
  const [entries, s] = await Promise.all([listEntries(f), getSettings()]);
  const filtered = Object.values(f).some(Boolean);

  return (
    <>
      <PageTitle
        title="Journal Entries"
        description="Every transaction in the books. Only posted entries affect balances and reports."
        actions={
          <Link href="/accounting/journal/new" className={btnPrimary}>
            New journal entry
          </Link>
        }
      />
      <form method="get" className="mb-3 grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <F label="Search" className="col-span-2">
          <input
            name="q"
            defaultValue={f.q}
            placeholder="Number, description, reference, account, party"
            className={input}
          />
        </F>
        <F label="Status">
          <select name="status" defaultValue={f.status} className={input}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="reversed">Reversed</option>
          </select>
        </F>
        <F label="Type">
          <select name="kind" defaultValue={f.kind} className={input}>
            <option value="">All</option>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </F>
        <F label="From">
          <input type="date" name="from" defaultValue={f.from} className={input} />
        </F>
        <F label="To">
          <input type="date" name="to" defaultValue={f.to} className={input} />
        </F>
        <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-6">
          <button className={btn}>Apply filters</button>
          {filtered && (
            <Link href="/accounting/journal" className={btn}>
              Clear
            </Link>
          )}
        </div>
      </form>

      <Panel>
        {entries.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Number</th>
                <th className={th}>Description</th>
                <th className={th}>Reference</th>
                <th className={th}>Type</th>
                <th className={th}>Status</th>
                <th className={thR}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={rowCls}>
                  <td className={td + " whitespace-nowrap"}>{e.date}</td>
                  <td className={td + " whitespace-nowrap"}>
                    <Link href={`/accounting/journal/${e.id}`} className={linkCls}>
                      {e.entryNumber ?? "Draft"}
                    </Link>
                  </td>
                  <td className={td}>
                    <Link href={`/accounting/journal/${e.id}`} className="hover:underline">
                      {e.description || "(no description)"}
                    </Link>
                    {Number(e.attachmentCount) > 0 && (
                      <Paperclip
                        className="ml-1.5 inline h-3.5 w-3.5 text-slate-400"
                        aria-label={`${e.attachmentCount} attachment(s)`}
                      />
                    )}
                  </td>
                  <td className={td}>{e.reference}</td>
                  <td className={td}>{KIND_LABEL[e.kind] ?? e.kind}</td>
                  <td className={td}>
                    <EntryStatus status={e.status} reversed={!!e.reversedByEntryId} />
                  </td>
                  <td className={tdR}>{formatAmount(Number(e.total), s.decimals)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>
            {filtered
              ? "No entries match these filters."
              : "No journal entries yet. Create one, or use Quick Transactions for everyday receipts and payments."}
          </Empty>
        )}
      </Panel>
      {entries.length === 500 && (
        <p className="mt-2 text-[12px] text-slate-500">Showing the 500 most recent matches. Narrow the filters to see older entries.</p>
      )}
    </>
  );
}
