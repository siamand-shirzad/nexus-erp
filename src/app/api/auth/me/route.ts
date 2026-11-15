import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, requireUser, unauthorized, DEMO, demoLocked } from "@/lib/api";

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  if (!user) return fail("Account no longer exists.", 404);

  return ok({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
      department: user.department,
      phone: user.phone,
      avatarColor: user.avatarColor,
      status: user.status,
      createdAt: user.createdAt,
    },
  });
}

export async function PATCH(req: Request) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (DEMO && typeof body.password === "string") return demoLocked();
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.title === "string") patch.title = body.title.trim() || null;
  if (typeof body.phone === "string") patch.phone = body.phone.trim() || null;
  if (typeof body.avatarColor === "string") patch.avatarColor = body.avatarColor;
  if (typeof body.password === "string" && body.password.length >= 6) {
    const { hashPassword } = await import("@/lib/auth");
    patch.passwordHash = await hashPassword(body.password);
  }

  const [user] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, session.sub))
    .returning();

  return ok({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
      department: user.department,
      phone: user.phone,
      avatarColor: user.avatarColor,
      status: user.status,
      createdAt: user.createdAt,
    },
  });
}
