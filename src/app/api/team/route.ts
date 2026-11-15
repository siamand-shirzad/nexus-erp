import { db } from "@/db";
import { users } from "@/db/schema";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  forbidden,
  logActivity,
} from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { listTeamMembers } from "@/lib/queries";

const COLORS = ["#4f46e5", "#0d9488", "#d946ef", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#16a34a"];

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  return ok(await listTeamMembers());
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role !== "admin") return forbidden();
  const body = await readJson(req);

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!name || !email) return fail("Name and email are required.", 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.", 422);
  const role = ["admin", "manager", "seller"].includes(body.role) ? body.role : "seller";

  try {
    const [row] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash: await hashPassword(String(body.password ?? "welcome123")),
        role,
        title: String(body.title ?? "").trim() || null,
        department: String(body.department ?? "").trim() || null,
        phone: String(body.phone ?? "").trim() || null,
        avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
      })
      .returning();
    await logActivity(session, "team.joined", "team", `Invited ${row.name} (${row.role})`);
    const [full] = (await listTeamMembers()).filter((m) => m.id === row.id);
    return ok(full ?? row, 201);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "23505") return fail("A user with that email already exists.", 409);
    return fail("Failed to create user.", 500);
  }
}
