import { requireBooksAccess } from "@/lib/accounting/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays } from "@/lib/accounting/core";
import { listParties } from "@/lib/accounting/masterdata";
import { ledger, partyBalances } from "@/lib/accounting/reports";
import { getSettings } from "@/lib/accounting/setup";
import { formatAmount } from "@/lib/accounting/money";
import { rangeFrom, type Params } from "@/lib/accounting/range";
import { ExportButtons } from "@/components/accounting/kit";
import { LedgerTable, ledgerExport } from "@/components/accounting/LedgerTable";
import { Balance, F, PageTitle, Panel, Pill, Stat, btn, input } from "@/components/accounting/ui";

export default async function PartyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Params }) {
  await requireBooksAccess();
  const { id } = await params;
  const party = (await listParties()).find((p) => p.id === id);
  if (!party) notFound();
  const { from, to } = await rangeFrom(await searchParams);
  const [l, closing, opening, s] = await Promise.all([
    ledger({ partyId: id, from, to }),
    partyBalances(to),
    partyBalances(addDays(from, -1)),
    getSettings(),
  ]);
  const b = closing.find((x) => x.partyId === id)!;
  const o = opening.find((x) => x.partyId === id)!;
  const fmt = (n: number) => formatAmount(n, s.decimals);
  const net = b.receivable - b.payable;
  const exp = ledgerExport(l, s.decimals);
  const meta = [
    `${s.businessName}`,
    `Party: ${party.name}${party.code ? ` (${party.code})` : ""}`,
    `Period: ${from} to ${to}`,
    `Currency: ${s.currencyCode} (${s.currencyLabel})`,
    `Receivable ${fmt(b.receivable)} · Payable ${fmt(b.payable)}`,
  ];

  return (
    <>
      <PageTitle
        title={party.name}
        description={
          <>
            Account statement · {from} to {to} · {s.currencyCode} ({s.currencyLabel})
            {party.code && <> · code {party.code}</>}
            {party.phone && <> · {party.phone}</>}{" "}
            {party.isCustomer && <Pill tone="indigo">Customer</Pill>} {party.isSupplier && <Pill tone="amber">Supplier</Pill>}
          </>
        }
        actions={
          <>
            <Link href="/accounting/parties" className={btn}>
              All parties
            </Link>
            <ExportButtons title={`Statement ${party.name}`} meta={meta} columns={exp.columns} rows={exp.rows} />
          </>
        }
      />
      {party.notes && <p className="mb-3 text-[13px] text-slate-600">{party.notes}</p>}

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <F label="From">
          <input type="date" name="from" defaultValue={from} className={input} />
        </F>
        <F label="To">
          <input type="date" name="to" defaultValue={to} className={input} />
        </F>
        <button className={btn}>Apply</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Receivable at ${to}`} value={fmt(b.receivable)} hint={`Opening ${fmt(o.receivable)} · they owe you`} />
        <Stat label={`Payable at ${to}`} value={fmt(b.payable)} hint={`Opening ${fmt(o.payable)} · you owe them`} />
        <Stat
          label="Net position (receivable minus payable)"
          value={fmt(Math.abs(net))}
          hint={net === 0 ? "Settled" : net > 0 ? "Net: they owe you" : "Net: you owe them"}
        />
        <Stat label="Statement closing balance" value={<Balance value={l.closing} decimals={s.decimals} />} hint="Dr = they owe you, Cr = you owe them" />
      </div>

      <Panel title="Transactions on receivable, payable and other party accounts">
        <LedgerTable l={l} decimals={s.decimals} from={from} showAccount showParty={false} />
      </Panel>
      <p className="mt-2 text-[12px] text-slate-500">
        The running balance combines this party&apos;s control accounts: debit (Dr) means the party owes the
        business, credit (Cr) means the business owes the party. Click a row to open its journal entry.
      </p>
    </>
  );
}
