import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";

// Storage: real PostgreSQL when DATABASE_URL is set, otherwise an embedded
// PostgreSQL (PGlite) persisted in ./data/pgdata. Same SQL dialect either way.
// ponytail: PGlite is single-process; set DATABASE_URL if you ever need more than one server process.
export type Db = PgliteDatabase;

const g = globalThis as typeof globalThis & { __nexusDb?: Db };

function create(): Db {
  const url = process.env.DATABASE_URL;
  if (url) return drizzlePg(new Pool({ connectionString: url })) as unknown as Db;
  const dir = process.env.PGLITE_DIR ?? "./data/pgdata";
  if (!dir.includes("://")) mkdirSync(dir, { recursive: true });
  return drizzlePglite(new PGlite(dir));
}

export function getDb(): Db {
  return (g.__nexusDb ??= create());
}

// Lazy so importing this module (e.g. during `next build`) never opens the database.
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});
