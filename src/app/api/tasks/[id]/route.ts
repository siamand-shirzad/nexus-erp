import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  notFound,
  logActivity,
} from "@/lib/api";
import { listTasks } from "@/lib/queries";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!existing) return notFound();

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (body.description !== undefined)
    patch.description = String(body.description).trim() || null;
  if (["low", "medium", "high"].includes(body.priority)) patch.priority = body.priority;
  if (body.assigneeId !== undefined)
    patch.assigneeId = body.assigneeId ? String(body.assigneeId) : null;
  if (body.dueDate !== undefined)
    patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  if (["todo", "in_progress", "done"].includes(body.status) && body.status !== existing.status) {
    patch.status = body.status;
    patch.completedAt = body.status === "done" ? new Date() : null;
    if (body.status === "done") {
      await logActivity(session, "task.completed", "task", `Completed "${existing.title}"`);
    }
  }

  await db.update(tasks).set(patch).where(eq(tasks.id, id));
  const [row] = (await listTasks()).filter((t) => t.id === id);
  return ok(row ?? { success: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const { id } = await ctx.params;

  const [existing] = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!existing) return notFound();

  await db.delete(tasks).where(eq(tasks.id, id));
  await logActivity(session, "task.deleted", "task", `Deleted task "${existing.title}"`);
  return ok({ success: true });
}
