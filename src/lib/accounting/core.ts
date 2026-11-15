import { AsyncLocalStorage } from "node:async_hooks";
import { db, type Db } from "@/db";
import { accAudit } from "@/db/accounting-schema";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

export interface Issue {
  /** form field path, e.g. "date" or "lines.2.accountId" */
  field: string;
  message: string;
}

/** A rejected accounting operation. Safe to show to the user. */
export class AccError extends Error {
  issues: Issue[];
  constructor(message: string, issues: Issue[] = []) {
    super(message);
    this.issues = issues;
  }
}

export function fail(message: string, field = ""): never {
  throw new AccError(message, field ? [{ field, message }] : []);
}

/** Name of the signed-in user, set by the server-action wrapper, recorded in the audit log. */
export const actorStore = new AsyncLocalStorage<string>();

export async function audit(
  tx: DbLike,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  detail?: unknown
) {
  await tx.insert(accAudit).values({
    actor: actorStore.getStore() ?? null,
    action,
    entityType,
    entityId,
    summary,
    detail: detail ?? null,
  });
}

export const transaction = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

// ---- dates are ISO "YYYY-MM-DD" strings; arithmetic is done in UTC ----
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000
  );
}

export const clean = (v: unknown) => String(v ?? "").trim();
export const cleanOrNull = (v: unknown) => clean(v) || null;
export const num = (v: unknown) => Number(v ?? 0);
