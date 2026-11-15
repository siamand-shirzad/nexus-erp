import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsView } from "./SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  if (!user) redirect("/login");

  return (
    <SettingsView
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        title: user.title ?? "",
        department: user.department ?? "",
        phone: user.phone ?? "",
        avatarColor: user.avatarColor,
        createdAt: user.createdAt.toISOString(),
      }}
    />
  );
}
