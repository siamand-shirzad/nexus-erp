import { requireBooksAccess } from "@/lib/accounting/guard";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { accAudit } from "@/db/accounting-schema";
import { addDays, todayIso } from "@/lib/accounting/core";
import { listAccounts } from "@/lib/accounting/masterdata";
import { getSettings, listFiscalYears } from "@/lib/accounting/setup";
import { Empty, PageTitle, Panel, Table, rowCls, td, th, stamp } from "@/components/accounting/ui";
import { BackupAndDemo, FiscalYears, GeneralSettings } from "./SettingsView";

export default async function AccountingSettingsPage() {
  await requireBooksAccess();
  const [s, accounts, years, log, counts] = await Promise.all([
    getSettings(),
    listAccounts(),
    listFiscalYears(),
    db.select().from(accAudit).orderBy(desc(accAudit.at)).limit(150),
    db.execute(sql`select (select count(*) from acc_lines) + (select count(*) from acc_statement_lines) as n`),
  ]);
  const last = years[years.length - 1];
  return (
    <div className="space-y-4">
      <PageTitle title="Accounting Settings" description="Currency, fiscal years and period locks, year-end closing, backups and the audit log." />
      <GeneralSettings
        settings={{
          businessName: s.businessName,
          currencyCode: s.currencyCode,
          currencyLabel: s.currencyLabel,
          decimals: s.decimals,
          retainedEarningsAccountId: s.retainedEarningsAccountId ?? "",
          isDemo: s.isDemo,
        }}
        hasAmounts={Number(counts.rows[0].n) > 0}
        equityAccounts={accounts.filter((a) => a.category === "equity" && a.postable).map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))}
      />
      <FiscalYears
        decimals={s.decimals}
        nextStart={last ? addDays(last.endDate, 1) : `${todayIso().slice(0, 4)}-01-01`}
        years={years.map((y) => ({
          id: y.id,
          name: y.name,
          startDate: y.startDate,
          endDate: y.endDate,
          isClosed: y.isClosed,
          periods: y.periods.map((p) => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate, isLocked: p.isLocked })),
        }))}
      />
      <BackupAndDemo isDemo={s.isDemo} />
      <Panel title="Audit log (latest 150)">
        {log.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>What</th>
                <th className={th}>Action</th>
                <th className={th}>By</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id} className={rowCls}>
                  <td className={td + " whitespace-nowrap"}>{stamp(l.at).slice(0, 19)}</td>
                  <td className={td}>
                    {l.summary}
                    {l.detail != null && typeof (l.detail as { reason?: string }).reason === "string" && (
                      <span className="text-slate-500"> · reason: {(l.detail as { reason: string }).reason}</span>
                    )}
                  </td>
                  <td className={td + " text-slate-500"}>{l.action}</td>
                  <td className={td}>{l.actor}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>Nothing logged yet.</Empty>
        )}
      </Panel>
    </div>
  );
}
