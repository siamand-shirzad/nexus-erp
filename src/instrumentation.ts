export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // once per server start, before any request: schema migrations, then the starter books
    const { runMigrations } = await import("./db/migrate");
    await runMigrations();
    const { ensureAccountingSetup } = await import("./lib/accounting/setup");
    await ensureAccountingSetup();
  }
}
