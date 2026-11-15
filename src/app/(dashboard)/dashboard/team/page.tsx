import { redirect } from "next/navigation";
import { listTeamMembers, listTeams } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { TeamView } from "./TeamView";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const [members, teams, session] = await Promise.all([
    listTeamMembers(),
    listTeams(),
    getSession(),
  ]);
  if (session?.role === "seller") redirect("/dashboard");
  return <TeamView initialMembers={members} initialTeams={teams} role={session!.role} />;
}
