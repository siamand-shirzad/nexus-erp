import { requireBooksAccess } from "@/lib/accounting/guard";
import { listParties } from "@/lib/accounting/masterdata";
import { partyBalances } from "@/lib/accounting/reports";
import { getSettings } from "@/lib/accounting/setup";
import { PageTitle } from "@/components/accounting/ui";
import { PartiesView } from "./PartiesView";

export default async function PartiesPage() {
  await requireBooksAccess();
  const [parties, balances, s] = await Promise.all([listParties(), partyBalances(), getSettings()]);
  const byId = new Map(balances.map((b) => [b.partyId, b]));
  return (
    <>
      <PageTitle
        title="Parties"
        description="Customers, suppliers and anyone else you keep a balance with. Open a party for its statement."
      />
      <PartiesView
        decimals={s.decimals}
        parties={parties.map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
          code: p.code,
          notes: p.notes,
          isCustomer: p.isCustomer,
          isSupplier: p.isSupplier,
          isActive: p.isActive,
          receivable: byId.get(p.id)?.receivable ?? 0,
          payable: byId.get(p.id)?.payable ?? 0,
        }))}
      />
    </>
  );
}
