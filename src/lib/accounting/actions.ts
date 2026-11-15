"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { AccError, actorStore, fail, type Issue } from "./core";
import * as journal from "./journal";
import * as master from "./masterdata";
import * as setup from "./setup";
import * as recon from "./recon";
import * as backup from "./backup";
import * as demo from "./demo";
import { quickTransaction, type QuickInput } from "./quick";
import type { StatementMapping } from "./statement";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues: Issue[] };

/** Books are for the business owner only: every action requires the signed-in admin. */
async function run<T>(fn: () => Promise<T>, readOnly = false): Promise<ActionResult<T>> {
  const session = await getSession();
  if (!session || session.role !== "admin")
    return { ok: false, error: "Sign in as the administrator to use accounting.", issues: [] };
  try {
    const data = await actorStore.run(session.name, fn);
    if (!readOnly) revalidatePath("/accounting", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AccError) return { ok: false, error: e.message, issues: e.issues };
    // Log the failure type only: query text and parameters can contain financial data.
    const cause = (e as { cause?: { message?: string } })?.cause?.message;
    console.error("[accounting] action failed:", (e as Error)?.name ?? "Error", cause ?? "");
    return {
      ok: false,
      // messages raised by the database guards are written for users
      error: cause && /journal|entry|line/i.test(cause) ? cause : "Something went wrong. Nothing was saved.",
      issues: [],
    };
  }
}

const fileOf = async (form: FormData) => {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) fail("Choose a file.");
  if (file.size > 20 * 1024 * 1024) fail("Files are limited to 20 MB.");
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
};
const json = <T,>(form: FormData, key: string): T => JSON.parse(String(form.get(key) ?? "null"));

// ---- master data
export const saveAccountAction = async (input: master.AccountInput, id?: string) =>
  run(() => master.saveAccount(input, id));
export const deleteAccountAction = async (id: string) => run(() => master.deleteAccount(id));
export const savePartyAction = async (input: master.PartyInput, id?: string) =>
  run(() => master.saveParty(input, id));
export const deletePartyAction = async (id: string) => run(() => master.deleteParty(id));
export const saveBankAccountAction = async (input: master.BankAccountInput, id?: string) =>
  run(() => master.saveBankAccount(input, id));
export const deleteBankAccountAction = async (id: string) => run(() => master.deleteBankAccount(id));

// ---- journal
export const saveEntryAction = async (
  input: journal.EntryInput,
  opts: { id?: string; post?: boolean } = {}
) =>
  run(() =>
    opts.id
      ? journal.updateDraft(opts.id, input, { post: opts.post })
      : journal.createEntry(input, { post: opts.post })
  );
export const postEntryAction = async (id: string) => run(() => journal.postEntry(id));
export const deleteDraftAction = async (id: string) => run(() => journal.deleteDraft(id));
export const duplicateEntryAction = async (id: string) => run(() => journal.duplicateEntry(id));
export const reverseEntryAction = async (id: string, date: string, description?: string) =>
  run(() => journal.reverseEntry(id, { date, description }));
export const addAttachmentAction = async (form: FormData) =>
  run(async () => {
    const f = await fileOf(form);
    return journal.addAttachment(String(form.get("entryId")), f.name, f.bytes);
  });
export const deleteAttachmentAction = async (id: string) => run(() => journal.deleteAttachment(id));
export const quickTransactionAction = async (input: QuickInput) => run(() => quickTransaction(input));

// ---- statements & reconciliation
export const readStatementAction = async (form: FormData) =>
  run(async () => {
    const f = await fileOf(form);
    return recon.readStatementFile(f.name, f.bytes);
  }, true);
export const previewImportAction = async (form: FormData) =>
  run(async () => {
    const f = await fileOf(form);
    return recon.previewImport(
      String(form.get("bankAccountId")),
      f.name,
      f.bytes,
      json<StatementMapping>(form, "mapping")
    );
  }, true);
export const commitImportAction = async (form: FormData) =>
  run(async () => {
    const f = await fileOf(form);
    return recon.commitImport(
      String(form.get("bankAccountId")),
      f.name,
      f.bytes,
      json<StatementMapping>(form, "mapping"),
      json<recon.ImportExtras>(form, "extras") ?? {}
    );
  });
export const deleteImportAction = async (id: string) => run(() => recon.deleteImport(id));
export const resolveDuplicateAction = async (id: string, action: "keep" | "delete") =>
  run(() => recon.resolveDuplicate(id, action));
export const confirmMatchAction = async (bankAccountId: string, statementIds: string[], bookIds: string[]) =>
  run(() => recon.confirmMatch(bankAccountId, statementIds, bookIds));
export const unmatchAction = async (matchId: string) => run(() => recon.unmatch(matchId));
export const createAdjustmentAction = async (input: recon.AdjustmentInput) =>
  run(() => recon.createAdjustment(input));
export const completeReconciliationAction = async (
  input: Parameters<typeof recon.completeReconciliation>[0]
) => run(() => recon.completeReconciliation(input));
export const voidReconciliationAction = async (id: string, reason: string) =>
  run(() => recon.voidReconciliation(id, reason));

// ---- settings, periods, closing
export const updateSettingsAction = async (input: setup.SettingsInput) =>
  run(() => setup.updateSettings(input));
export const createFiscalYearAction = async (input: { name: string; startDate: string }) =>
  run(async () => (await setup.createFiscalYear(input)).id);
export const deleteFiscalYearAction = async (id: string) => run(() => setup.deleteFiscalYear(id));
export const lockPeriodAction = async (id: string) => run(() => setup.lockPeriod(id));
export const reopenPeriodAction = async (id: string, reason: string) =>
  run(() => setup.reopenPeriod(id, reason));
export const previewClosingAction = async (fiscalYearId: string) =>
  run(() => setup.previewClosing(fiscalYearId), true);
export const closeFiscalYearAction = async (fiscalYearId: string) =>
  run(() => setup.closeFiscalYear(fiscalYearId));
export const reopenFiscalYearAction = async (fiscalYearId: string, reason: string) =>
  run(() => setup.reopenFiscalYear(fiscalYearId, reason));

// ---- demo data, backup
export const loadDemoAction = async () => run(() => demo.loadDemo());
export const clearDemoAction = async () => run(() => demo.clearDemo());
export const validateBackupAction = async (form: FormData) =>
  run(async () => {
    const f = await fileOf(form);
    return backup.validateBackup(parseBackup(f.bytes));
  }, true);
export const restoreBackupAction = async (form: FormData) =>
  run(async () => {
    const f = await fileOf(form);
    return backup.restoreBackup(parseBackup(f.bytes));
  });

function parseBackup(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail("This is not an accounting backup file.");
  }
}
