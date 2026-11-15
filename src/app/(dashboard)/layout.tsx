import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { AppShell } from "@/components/layout/AppShell";
import type { Role } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  await ensureSeed();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);

  if (!user || user.status === "disabled") {
    redirect("/login");
  }

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        title: user.title ?? "",
        avatarColor: user.avatarColor,
      }}
    >
      {children}
    </AppShell>
  );
}
