import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { todayIso } from "@/lib/accounting/core";
import { formOptions } from "@/lib/accounting/options";
import { getSettings } from "@/lib/accounting/setup";
import { PageTitle, btn } from "@/components/accounting/ui";
import { EntryForm } from "../EntryForm";

export default async function NewEntryPage() {
  await requireBooksAccess();
  const [o, s] = await Promise.all([formOptions(), getSettings()]);
  return (
    <>
      <PageTitle
        title="New journal entry"
        description={`Amounts in ${s.currencyCode} (${s.currencyLabel}). Debits must equal credits before posting.`}
        actions={
          <Link href="/accounting/journal" className={btn}>
            Back to list
          </Link>
        }
      />
      <EntryForm accounts={o.accounts} parties={o.parties} decimals={s.decimals} today={todayIso()} />
    </>
  );
}
