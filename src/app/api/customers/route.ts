import { db } from "@/db";
import { customers } from "@/db/schema";
import {
  ok,
  fail,
  readJson,
  requireUser,
  unauthorized,
  logActivity,
} from "@/lib/api";
import { listCustomers } from "@/lib/queries";

export async function GET() {
  const session = await requireUser();
  if (!session) return unauthorized();
  return ok(await listCustomers());
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) return unauthorized();
  const body = await readJson(req);

  const name = String(body.name ?? "").trim();
  if (!name) return fail("Contact name is required.", 422);

  const [row] = await db
    .insert(customers)
    .values({
      name,
      company: String(body.company ?? "").trim() || null,
      email: String(body.email ?? "").trim() || null,
      phone: String(body.phone ?? "").trim() || null,
      city: String(body.city ?? "").trim() || null,
      country: String(body.country ?? "United States").trim() || "United States",
      status: ["active", "lead", "churned"].includes(body.status) ? body.status : "active",
      ownerId: body.ownerId || session.sub,
      notes: String(body.notes ?? "").trim() || null,
    })
    .returning();

  await logActivity(
    session,
    "customer.created",
    "customer",
    `Added customer ${row.company ?? row.name}`
  );
  return ok(row, 201);
}
