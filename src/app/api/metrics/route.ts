import { getMetrics } from "@/lib/metrics";
import { ok, requireUser, unauthorized } from "@/lib/api";

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  const metrics = await getMetrics();
  return ok(metrics);
}
