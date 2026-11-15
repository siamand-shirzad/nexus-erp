import { db } from "@/db";
import { teams } from "@/db/schema";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  forbidden,
  logActivity,
} from "@/lib/api";
import { listTeams } from "@/lib/queries";

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  return ok(await listTeams());
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const body = await readJson(req);

  const name = String(body.name ?? "").trim();
  if (!name) return fail("Team name is required.", 422);

  try {
    const [row] = await db
      .insert(teams)
      .values({
        name,
        description: String(body.description ?? "").trim() || null,
        leadId: body.leadId || null,
      })
      .returning();
    await logActivity(session, "team.created", "team", `Created team ${row.name}`);
    const [full] = (await listTeams()).filter((t) => t.id === row.id);
    return ok(full ?? row, 201);
  } catch (e) {
    if ((e as { code?: string })?.code === "23505")
      return fail("A team with that name already exists.", 409);
    return fail("Failed to create team.", 500);
  }
}
