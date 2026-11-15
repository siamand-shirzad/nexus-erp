import { requireBooksAccess } from "@/lib/accounting/guard";
import { notFound } from "next/navigation";
import { listBankAccounts } from "@/lib/accounting/masterdata";
import { getSettings } from "@/lib/accounting/setup";
import { PageTitle } from "@/components/accounting/ui";
import { ImportWizard } from "./ImportWizard";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBooksAccess();
  const { id } = await params;
  const bank = (await listBankAccounts()).find((b) => b.id === id);
  if (!bank || bank.kind !== "bank") notFound();
  const s = await getSettings();
  return (
    <>
      <PageTitle
        title={`Import bank statement: ${bank.name}`}
        description="Statement lines are stored separately from the books. Importing never creates journal entries."
      />
      <ImportWizard bankAccountId={bank.id} bankName={bank.name} decimals={s.decimals} currency={s.currencyCode} />
    </>
  );
}
