import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * The books belong to the business owner (the administrator account).
 * Every accounting page calls this before loading any data: a layout-level check alone
 * is not enough, because a page renders in parallel with its layout and its data would
 * still be streamed to the browser.
 */
export async function requireBooksAccess() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");
  return session;
}
