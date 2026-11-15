import { listCustomers, listTeamMembers } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { CustomersView } from "./CustomersView";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [customers, members, session] = await Promise.all([
    listCustomers(),
    listTeamMembers(),
    getSession(),
  ]);
  const owners = members
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.id, name: m.name, color: m.avatarColor, role: m.role }));
  return <CustomersView initialCustomers={customers} owners={owners} role={session!.role} />;
}
