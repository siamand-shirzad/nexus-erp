import { listOrders, listCustomers, listProducts, listTeamMembers } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { OrdersView } from "./OrdersView";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, customers, products, members, session] = await Promise.all([
    listOrders(),
    listCustomers(),
    listProducts(),
    listTeamMembers(),
    getSession(),
  ]);
  const sellers = members
    .filter((m) => m.status === "active" && m.role !== "admin")
    .map((m) => ({ id: m.id, name: m.name, color: m.avatarColor, role: m.role }));
  return (
    <OrdersView
      initialOrders={orders}
      customers={customers.map((c) => ({
        id: c.id,
        label: c.company ? `${c.company} — ${c.name}` : c.name,
        city: c.city ?? "",
      }))}
      products={products
        .filter((p) => p.status === "active")
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          icon: p.icon,
          price: p.price,
          stock: p.stock,
        }))}
      sellers={sellers}
      selfId={session!.sub}
      role={session!.role}
    />
  );
}
