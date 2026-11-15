import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { todayIso } from "@/lib/accounting/core";
import { getEntry } from "@/lib/accounting/journal";
import { formOptions } from "@/lib/accounting/options";
import { getSettings } from "@/lib/accounting/setup";
import { formatAmount } from "@/lib/accounting/money";
import {
  EntryLink,
  EntryStatus,
  KIND_LABEL,
  Money,
  PageTitle,
  Panel,
  Table,
  btn,
  ledgerHref,
  linkCls,
  rowCls,
  stamp,
  td,
  tdR,
  th,
  thR,
  totalRow,
} from "@/components/accounting/ui";
import { EntryForm } from "../EntryForm";
import { Attachments, EntryActions } from "./EntryActions";

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBooksAccess();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [entry, s] = await Promise.all([getEntry(id), getSettings()]);
  if (!entry) notFound();
  const isDraft = entry.status === "draft";
  const total = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const back = (
    <Link href="/accounting/journal" className={btn}>
      Back to list
    </Link>
  );

  const history = (
    <Panel title="Change history" className="mt-4">
      <Table>
        <tbody>
          {entry.history.map((h) => (
            <tr key={h.id} className={rowCls}>
              <td className={td + " whitespace-nowrap"}>{stamp(h.at).slice(0, 16)}</td>
              <td className={td}>{h.summary}</td>
              <td className={td}>{h.actor}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
  const attachments = (
    <Panel title="Supporting documents" className="mt-4">
      <Attachments
        entryId={entry.id}
        attachments={entry.attachments.map((a) => ({ id: a.id, filename: a.filename, size: a.size }))}
        canDelete={isDraft}
      />
    </Panel>
  );

  if (isDraft) {
    const o = await formOptions();
    return (
      <>
        <PageTitle
          title="Draft journal entry"
          description="Drafts do not affect balances or reports until they are posted."
          actions={back}
        />
        <EntryForm
          accounts={o.accounts}
          parties={o.parties}
          decimals={s.decimals}
          today={todayIso()}
          initial={{
            id: entry.id,
            date: entry.date,
            description: entry.description,
            reference: entry.reference ?? "",
            kind: entry.kind,
            lines: entry.lines,
          }}
        />
        {attachments}
        {history}
      </>
    );
  }

  return (
    <>
      <PageTitle
        title={`Journal entry ${entry.entryNumber}`}
        description={`${s.businessName} · amounts in ${s.currencyCode} (${s.currencyLabel})`}
        actions={
          <>
            {back}
            <EntryActions
              id={entry.id}
              entryNumber={entry.entryNumber!}
              canReverse={!entry.reversedBy && entry.kind !== "closing"}
              today={todayIso()}
            />
          </>
        }
      />
      <Panel>
        <dl className="grid gap-x-6 gap-y-2 p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Date</dt>
            <dd className="font-medium">{entry.date}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Status</dt>
            <dd>
              <EntryStatus status={entry.status} reversed={!!entry.reversedBy} />{" "}
              <span className="text-slate-500">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Reference</dt>
            <dd>{entry.reference || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Total</dt>
            <dd className="font-semibold tnum">{formatAmount(total, s.decimals)}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Description</dt>
            <dd>{entry.description}</dd>
          </div>
          {entry.reversedBy && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800 sm:col-span-2 lg:col-span-4">
              Reversed by <EntryLink id={entry.reversedBy.id}>{entry.reversedBy.entryNumber}</EntryLink> on{" "}
              {entry.reversedBy.date}. Both entries stay in the books and net to zero.
            </p>
          )}
          {entry.reverses && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 sm:col-span-2 lg:col-span-4">
              This entry reverses <EntryLink id={entry.reverses.id}>{entry.reverses.entryNumber}</EntryLink> (dated{" "}
              {entry.reverses.date}).
            </p>
          )}
        </dl>
        <div className="border-t border-slate-200">
          <Table>
            <thead>
              <tr>
                <th className={th}>Account</th>
                <th className={th}>Party</th>
                <th className={th}>Line description</th>
                <th className={thR}>Debit</th>
                <th className={thR}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((l) => (
                <tr key={l.id} className={rowCls}>
                  <td className={td}>
                    <Link href={ledgerHref({ account: l.accountId })} className={linkCls}>
                      {l.accountCode}
                    </Link>{" "}
                    {l.accountName}
                  </td>
                  <td className={td}>
                    {l.partyId && (
                      <Link href={`/accounting/parties/${l.partyId}`} className={linkCls}>
                        {l.partyName}
                      </Link>
                    )}
                  </td>
                  <td className={td}>{l.description}</td>
                  <td className={tdR}>
                    <Money value={l.debit} decimals={s.decimals} />
                  </td>
                  <td className={tdR}>
                    <Money value={l.credit} decimals={s.decimals} />
                  </td>
                </tr>
              ))}
              <tr className={totalRow}>
                <td className={td} colSpan={3}>
                  Total
                </td>
                <td className={tdR}>{formatAmount(total, s.decimals)}</td>
                <td className={tdR}>{formatAmount(total, s.decimals)}</td>
              </tr>
            </tbody>
          </Table>
        </div>
      </Panel>
      {attachments}
      {history}
    </>
  );
}
