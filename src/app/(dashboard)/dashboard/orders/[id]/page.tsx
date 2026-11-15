import { notFound } from "next/navigation";
import { getOrderDetail, listTeamMembers, listInvoices } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { OrderDetailView } from "./OrderDetailView";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, members, invoices, session] = await Promise.all([
    getOrderDetail(id),
    listTeamMembers(),
    listInvoices(),
    getSession(),
  ]);
  if (!order) notFound();
  const invoice = invoices.find((inv) => inv.orderId === id) ?? null;
  const sellers = members
    .filter((m) => m.status === "active" && m.role !== "admin")
    .map((m) => ({ id: m.id, name: m.name, color: m.avatarColor, role: m.role }));

  return (
    <OrderDetailView
      initialOrder={order}
      initialInvoice={invoice}
      sellers={sellers}
      role={session!.role}
    />
  );
}
