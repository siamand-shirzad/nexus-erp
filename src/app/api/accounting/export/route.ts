import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface ExportBody {
  title: string;
  meta?: string[];
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

/** Turns a report table (as shown on screen) into an .xlsx file. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Forbidden", { status: 403 });
  const body = (await req.json().catch(() => null)) as ExportBody | null;
  if (!body || !Array.isArray(body.columns) || !Array.isArray(body.rows) || body.rows.length > 50000)
    return new Response("Bad request", { status: 400 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report");
  ws.addRow([String(body.title ?? "Report")]).font = { bold: true, size: 14 };
  for (const line of body.meta ?? []) ws.addRow([String(line)]);
  ws.addRow([]);
  ws.addRow(body.columns.map(String)).font = { bold: true };
  for (const r of body.rows) ws.addRow(r.map((c) => (typeof c === "number" ? c : (c ?? ""))));
  body.columns.forEach((c, i) => {
    const longest = Math.max(c.length, ...body.rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
    const col = ws.getColumn(i + 1);
    col.width = Math.min(50, Math.max(10, longest + 2));
    if (body.rows.some((r) => typeof r[i] === "number")) col.numFmt = "#,##0.####";
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="report.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
