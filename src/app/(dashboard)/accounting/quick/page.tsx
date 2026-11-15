import { requireBooksAccess } from "@/lib/accounting/guard";
import { todayIso } from "@/lib/accounting/core";
import { listEntries } from "@/lib/accounting/journal";
import { formOptions } from "@/lib/accounting/options";
import { getSettings } from "@/lib/accounting/setup";
import { formatAmount } from "@/lib/accounting/money";
import {
  Empty,
  EntryLink,
  EntryStatus,
  KIND_LABEL,
  PageTitle,
  Panel,
  Table,
  rowCls,
  td,
  tdR,
  th,
  thR,
} from "@/components/accounting/ui";
import { QuickForms } from "./QuickForms";

const QUICK = ["receipt", "payment", "expense", "transfer"];

export default async function QuickPage() {
  await requireBooksAccess();
  const [options, s, entries] = await Promise.all([formOptions(), getSettings(), listEntries()]);
  const recent = entries.filter((e) => QUICK.includes(e.kind)).slice(0, 15);
  return (
    <>
      <PageTitle
        title="Quick Transactions"
        description="Everyday receipts, payments, expenses and transfers. Each one posts a balanced journal entry; nothing is recorded twice."
      />
      <QuickForms options={options} decimals={s.decimals} today={todayIso()} currency={s.currencyCode} />
      <Panel title="Recent quick transactions" className="mt-4">
        {recent.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Entry</th>
                <th className={th}>Type</th>
                <th className={th}>Description</th>
                <th className={th}>Status</th>
                <th className={thR}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.id} className={rowCls}>
                  <td className={td}>{e.date}</td>
                  <td className={td}>
                    <EntryLink id={e.id}>{e.entryNumber}</EntryLink>
                  </td>
                  <td className={td}>{KIND_LABEL[e.kind]}</td>
                  <td className={td}>{e.description}</td>
                  <td className={td}>
                    <EntryStatus status={e.status} reversed={!!e.reversedByEntryId} />
                  </td>
                  <td className={tdR}>{formatAmount(Number(e.total), s.decimals)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>No quick transactions yet.</Empty>
        )}
      </Panel>
    </>
  );
}
