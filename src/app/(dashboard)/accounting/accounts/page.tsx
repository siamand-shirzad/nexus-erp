import { requireBooksAccess } from "@/lib/accounting/guard";
import { listAccounts } from "@/lib/accounting/masterdata";
import { trialBalance } from "@/lib/accounting/reports";
import { getSettings } from "@/lib/accounting/setup";
import { PageTitle } from "@/components/accounting/ui";
import { AccountsView } from "./AccountsView";

export default async function AccountsPage() {
  await requireBooksAccess();
  const [accounts, tb, s] = await Promise.all([listAccounts(), trialBalance({}), getSettings()]);
  const balance = new Map(tb.rows.map((r) => [r.id, r.closing]));
  return (
    <>
      <PageTitle
        title="Chart of Accounts"
        description="General accounts, sub-accounts and the detailed accounts you post to. Accounts with history can be deactivated, not deleted."
      />
      <AccountsView
        decimals={s.decimals}
        accounts={accounts.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          category: a.category,
          parentId: a.parentId,
          isActive: a.isActive,
          isPosting: a.isPosting,
          requiresParty: a.requiresParty,
          postable: a.postable,
          depth: a.depth,
          lineCount: a.lineCount,
          childCount: a.childCount,
          balance: balance.get(a.id) ?? 0,
        }))}
      />
    </>
  );
}
