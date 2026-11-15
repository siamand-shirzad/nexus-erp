import { db } from "@/db";
import { teams, teamMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  forbidden,
  notFound,
  logActivity,
} from "@/lib/api";
import { listTeams } from "@/lib/queries";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const [existing] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, id))
    .limit(1);
  if (!existing) return notFound();

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.description !== undefined)
    patch.description = String(body.description).trim() || null;
  if (body.leadId !== undefined) patch.leadId = body.leadId || null;

  await db.transaction(async (tx) => {
    await tx.update(teams).set(patch).where(eq(teams.id, id));
    if (Array.isArray(body.memberIds)) {
      await tx.delete(teamMembers).where(eq(teamMembers.teamId, id));
      if (body.memberIds.length) {
        await tx
          .insert(teamMembers)
          .values(body.memberIds.map((userId: string) => ({ teamId: id, userId })));
      }
    }
  });

  await logActivity(session, "team.updated", "team", `Updated team ${existing.name}`);
  const [row] = (await listTeams()).filter((t) => t.id === id);
  return ok(row ?? { success: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const { id } = await ctx.params;

  const [existing] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.id, id))
    .limit(1);
  if (!existing) return notFound();

  await db.delete(teams).where(eq(teams.id, id));
  await logActivity(session, "team.deleted", "team", `Deleted team ${existing.name}`);
  return ok({ success: true });
}
