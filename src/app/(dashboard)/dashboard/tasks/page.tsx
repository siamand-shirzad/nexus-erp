import { listTasks, listTeamMembers } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { TasksView } from "./TasksView";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, members, session] = await Promise.all([
    listTasks(),
    listTeamMembers(),
    getSession(),
  ]);
  const people = members
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.id, name: m.name, color: m.avatarColor, role: m.role }));
  return <TasksView initialTasks={tasks} people={people} selfId={session!.sub} />;
}
