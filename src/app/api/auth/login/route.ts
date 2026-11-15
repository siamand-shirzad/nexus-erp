import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, readJson } from "@/lib/api";
import {
  verifyPassword,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(req: Request) {
  const body = await readJson(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return fail("Email and password are required.", 422);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return fail("Invalid email or password.", 401);
  if (user.status === "disabled")
    return fail("This account has been deactivated. Contact an administrator.", 403);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return fail("Invalid email or password.", 401);

  const token = await createSessionToken(user);
  await setSessionCookie(token);

  return ok({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
      avatarColor: user.avatarColor,
    },
  });
}
