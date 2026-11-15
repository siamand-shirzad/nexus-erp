import { ok, fail, requireUser, unauthorized, forbidden } from "@/lib/api";
import { resetAndSeed } from "@/lib/seed";

export async function POST() {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role !== "admin") return forbidden();
  try {
    const counts = await resetAndSeed();
    return ok({ success: true, counts });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Seeding failed", 500);
  }
}
