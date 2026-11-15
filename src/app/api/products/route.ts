import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  forbidden,
  logActivity,
  ValidationError,
} from "@/lib/api";
import { listProducts } from "@/lib/queries";

const toCents = (v: unknown) => {
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) throw new ValidationError("Amount must be a positive number.");
  return Math.round(n * 100);
};

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  return ok(await listProducts());
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) return unauthorized();
  if (session.role === "seller") return forbidden();
  const body = await readJson(req);
  try {
    const name = String(body.name ?? "").trim();
    if (!name) return fail("Product name is required.", 422);

    let sku = String(body.sku ?? "").trim().toUpperCase();
    if (!sku) {
      const prefix =
        String(body.category ?? "GEN").slice(0, 3).toUpperCase().replace(/\s/g, "") ||
        "GEN";
      sku = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, sku))
      .limit(1);
    if (existing.length) sku = `${sku}-${Math.floor(Math.random() * 900) + 100}`;

    const [row] = await db
      .insert(products)
      .values({
        sku,
        name,
        description: String(body.description ?? "").trim() || null,
        category: String(body.category ?? "General").trim() || "General",
        icon: String(body.icon ?? "📦"),
        price: body.price !== undefined ? toCents(body.price) : 0,
        cost: body.cost !== undefined ? toCents(body.cost) : 0,
        stock: Math.max(0, Number(body.stock ?? 0) || 0),
        reorderLevel: Math.max(0, Number(body.reorderLevel ?? 10) || 10),
        status: body.status === "archived" ? "archived" : "active",
      })
      .returning();

    await logActivity(session, "product.created", "product", `Added product ${row.name} (${row.sku})`);
    return ok(row, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message, 422);
    return fail("Failed to create product.", 500);
  }
}
