import { getSession } from "@/lib/auth";
import { createBackup } from "@/lib/accounting/backup";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Forbidden", { status: 403 });
  const backup = await createBackup();
  const stamp = backup.createdAt.slice(0, 19).replace(/[:T]/g, "-");
  return new Response(JSON.stringify(backup), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="accounting-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
