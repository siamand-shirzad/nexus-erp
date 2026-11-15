import { db } from "@/db";
import { activities, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ok, requireUser, unauthorized } from "@/lib/api";
import type { ActivityRow } from "@/lib/dto";

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();

  const rows = await db
    .select({
      id: activities.id,
      actorId: activities.actorId,
      actorName: activities.actorName,
      action: activities.action,
      targetType: activities.targetType,
      summary: activities.summary,
      createdAt: activities.createdAt,
      actorColor: users.avatarColor,
    })
    .from(activities)
    .leftJoin(users, eq(activities.actorId, users.id))
    .orderBy(desc(activities.createdAt))
    .limit(30);

  return ok(rows as ActivityRow[]);
}
