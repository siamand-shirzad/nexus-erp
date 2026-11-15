import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { getSession, type SessionUser } from "@/lib/auth";

export function ok(data: unknown = { success: true }, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function requireUser(): Promise<SessionUser | null> {
  return getSession();
}

export const unauthorized = () => fail("Please sign in to continue.", 401);
export const forbidden = () =>
  fail("You don't have permission to perform this action.", 403);
export const notFound = () => fail("Resource not found.", 404);

export async function logActivity(
  actor: ({ sub: string; name: string } | { id: string; name: string } | null),
  action: string,
  targetType: string,
  summary: string
) {
  try {
    const actorId = actor
      ? "sub" in actor
        ? actor.sub
        : actor.id
      : null;
    await db.insert(activities).values({
      actorId,
      actorName: actor?.name ?? null,
      action,
      targetType,
      summary,
    });
  } catch {
    // Activity logging must never break the main action
  }
}

export function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined || value === "") {
    throw new ValidationError(message);
  }
  return value;
}

export class ValidationError extends Error {}
