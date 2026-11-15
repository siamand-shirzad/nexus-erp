import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "./index";

let done: Promise<void> | undefined;

/** Applies pending SQL migrations from ./drizzle. Safe to call repeatedly. */
export function runMigrations(): Promise<void> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  return (done ??= (
    process.env.DATABASE_URL
      ? migratePg(getDb() as never, { migrationsFolder })
      : migratePglite(getDb(), { migrationsFolder })
  ) as Promise<void>);
}
