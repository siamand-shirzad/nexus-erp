import { requireBooksAccess } from "@/lib/accounting/guard";
import { ensureAccountingSetup, getSettings } from "@/lib/accounting/setup";

export const dynamic = "force-dynamic";

export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  await requireBooksAccess();
  await ensureAccountingSetup();
  const settings = await getSettings();
  return (
    <>
      {settings.isDemo && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[13px] font-medium text-amber-900"
        >
          DEMO DATA. These books contain a fictional sample dataset, not real business records. Clear it in
          Accounting &rarr; Settings before entering real transactions.
        </div>
      )}
      {children}
    </>
  );
}
