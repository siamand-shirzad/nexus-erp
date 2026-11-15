import { getSession } from "@/lib/auth";
import { getAttachment } from "@/lib/accounting/journal";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const a = await getAttachment(id);
  if (!a) return new Response("Not found", { status: 404 });
  // always a download with a whitelisted type: uploaded content is never rendered in the app's origin
  return new Response(Buffer.from(a.data, "base64"), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Disposition": `attachment; filename="${a.filename.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
