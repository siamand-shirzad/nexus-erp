import { db } from "@/db";
import { tasks } from "@/db/schema";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  logActivity,
} from "@/lib/api";
import { listTasks } from "@/lib/queries";

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  return ok(await listTasks());
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const body = await readJson(req);

  const title = String(body.title ?? "").trim();
  if (!title) return fail("Task title is required.", 422);

  const [row] = await db
    .insert(tasks)
    .values({
      title,
      description: String(body.description ?? "").trim() || null,
      status: ["todo", "in_progress", "done"].includes(body.status)
        ? body.status
        : "todo",
      priority: ["low", "medium", "high"].includes(body.priority)
        ? body.priority
        : "medium",
      assigneeId: body.assigneeId || null,
      creatorId: session.sub,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      completedAt: body.status === "done" ? new Date() : null,
    })
    .returning();

  await logActivity(session, "task.created", "task", `Created task "${row.title}"`);
  const [full] = (await listTasks()).filter((t) => t.id === row.id);
  return ok(full ?? row, 201);
}
