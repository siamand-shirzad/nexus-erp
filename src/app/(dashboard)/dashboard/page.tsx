import { getMetrics } from "@/lib/metrics";
import { DashboardView } from "./DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const metrics = await getMetrics();
  return <DashboardView initial={metrics} />;
}
