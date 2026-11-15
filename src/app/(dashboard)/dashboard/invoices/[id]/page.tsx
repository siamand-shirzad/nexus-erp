import { notFound } from "next/navigation";
import { getInvoiceDetail } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { InvoiceDetailView } from "./InvoiceDetailView";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, session] = await Promise.all([
    getInvoiceDetail(id),
    getSession(),
  ]);
  if (!invoice) notFound();
  return <InvoiceDetailView invoice={invoice} role={session!.role} />;
}
