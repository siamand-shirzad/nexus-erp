import { listInvoices } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { InvoicesView } from "./InvoicesView";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const [invoices, session] = await Promise.all([listInvoices(), getSession()]);
  return <InvoicesView initialInvoices={invoices} role={session!.role} />;
}
