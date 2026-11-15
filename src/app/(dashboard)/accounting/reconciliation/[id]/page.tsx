import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReconciliation } from "@/lib/accounting/recon";
import { getSettings } from "@/lib/accounting/setup";
import { formatAmount } from "@/lib/accounting/money";
import { ReconReport } from "@/components/accounting/ReconReport";
import { EntryLink, PageTitle, Panel, Pill, Table, btn, rowCls, td, tdR, th, thR, stamp } from "@/components/accounting/ui";
import { VoidReconciliationButton } from "../ReconClient";

export default async function ReconciliationReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBooksAccess();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [rec, s] = await Promise.all([getReconciliation(id), getSettings()]);
  if (!rec) notFound();
  const snap = rec.snapshot;
  const fmt = (n: number) => formatAmount(n, s.decimals);

  return (
    <>
      <PageTitle
        title={`Reconciliation: ${rec.bankName} at ${rec.cutoffDate}`}
        description={
          <>
            {s.businessName} · {s.currencyCode} ({s.currencyLabel}) · completed {stamp(rec.completedAt).slice(0, 10)}{" "}
            {rec.status === "completed" ? <Pill tone="green">Completed</Pill> : <Pill tone="red">Voided</Pill>}
          </>
        }
        actions={
          <>
            <Link href="/accounting/reconciliation" className={btn}>
              Back
            </Link>
            {rec.status === "completed" && <VoidReconciliationButton id={rec.id} />}
          </>
        }
      />
      {rec.status === "voided" && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">
          Voided on {rec.voidedAt ? stamp(rec.voidedAt).slice(0, 10) : ""}. Reason: {rec.voidReason}. The report below is kept as it was when completed.
        </p>
      )}
      {snap.acceptedUnrecorded && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Completed with statement items still missing from the books; they were reviewed and accepted as open items.
        </p>
      )}
      <Panel title="Reconciliation report as completed">
        <ReconReport data={snap} decimals={s.decimals} />
      </Panel>
      <Panel title={`Matched items included (${snap.confirmed.length})`} className="mt-4">
        <Table>
          <thead>
            <tr>
              <th className={th}>Statement</th>
              <th className={th}>Books</th>
              <th className={thR}>Total</th>
            </tr>
          </thead>
          <tbody>
            {snap.confirmed.map((m) => (
              <tr key={m.id} className={rowCls}>
                <td className={td}>
                  {m.statement.map((x) => (
                    <div key={x.id}>
                      {x.date} · {x.description} {x.reference && <span className="text-slate-500">· ref {x.reference}</span>}
                    </div>
                  ))}
                </td>
                <td className={td}>
                  {m.book.map((b) => (
                    <div key={b.id}>
                      {b.date} · <EntryLink id={b.entryId}>{b.entryNumber}</EntryLink> {b.description}
                    </div>
                  ))}
                </td>
                <td className={tdR}>{fmt(m.statement.reduce((t, x) => t + x.amount, 0))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
