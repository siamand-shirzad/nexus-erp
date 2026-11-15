import { AccError, clean, fail, transaction, type Issue } from "./core";
import { createEntryTx, type LineInput } from "./journal";
import { listAccounts, listBankAccounts } from "./masterdata";

export type QuickType = "receipt" | "payment" | "expense" | "transfer";

export interface QuickInput {
  type: QuickType;
  date: string;
  amount: number; // minor units, > 0
  bankAccountId: string;
  /** receipt / payment / expense: the other side of the entry */
  counterAccountId?: string;
  /** transfer: destination bank or cash account */
  toBankAccountId?: string;
  partyId?: string | null;
  reference?: string | null;
  description?: string;
  idempotencyKey?: string | null;
}

const DEFAULT_DESCRIPTION: Record<QuickType, string> = {
  receipt: "Money received",
  payment: "Money paid",
  expense: "Expense payment",
  transfer: "Transfer between accounts",
};

/**
 * Quick transactions are only a faster way to enter a journal entry. They build balanced
 * lines and go through createEntryTx, the same validation and posting path as manual entries.
 * Nothing else is stored, so a quick transaction can never be counted twice.
 */
export function quickTransaction(input: QuickInput) {
  return transaction(async (tx) => {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
      fail("Enter an amount greater than zero.", "amount");
    const banks = await listBankAccounts(tx);
    const bank = banks.find((b) => b.id === input.bankAccountId);
    if (!bank) fail("Choose a bank or cash account.", "bankAccountId");
    const bankLedgerIds = new Set(banks.map((b) => b.accountId));

    let lines: LineInput[];
    let counterIndex = 1;
    if (input.type === "transfer") {
      const to = banks.find((b) => b.id === input.toBankAccountId);
      if (!to) fail("Choose the destination account.", "toBankAccountId");
      if (to.id === bank.id) fail("Choose two different accounts.", "toBankAccountId");
      // two asset accounts move; no income or expense is involved
      lines = [
        { accountId: to.accountId, debit: input.amount, credit: 0 },
        { accountId: bank.accountId, debit: 0, credit: input.amount },
      ];
      counterIndex = -1;
    } else {
      const counter = (await listAccounts(tx)).find((a) => a.id === input.counterAccountId);
      if (!counter) fail("Choose an account.", "counterAccountId");
      if (bankLedgerIds.has(counter.id))
        fail("To move money between your own accounts, use Transfer.", "counterAccountId");
      if (input.type === "expense" && counter.category !== "expense")
        fail("Choose an expense account.", "counterAccountId");
      const counterLine = { accountId: counter.id, partyId: input.partyId || null };
      if (input.type === "receipt") {
        lines = [
          { accountId: bank.accountId, debit: input.amount, credit: 0 },
          { ...counterLine, debit: 0, credit: input.amount },
        ];
      } else {
        lines = [
          { ...counterLine, debit: input.amount, credit: 0 },
          { accountId: bank.accountId, debit: 0, credit: input.amount },
        ];
        counterIndex = 0;
      }
    }

    try {
      return await createEntryTx(
        tx,
        {
          date: input.date,
          description: clean(input.description) || DEFAULT_DESCRIPTION[input.type],
          reference: input.reference,
          kind: input.type,
          lines,
          idempotencyKey: input.idempotencyKey,
        },
        { post: true }
      );
    } catch (e) {
      if (!(e instanceof AccError)) throw e;
      // point line-level issues at the matching form field
      const issues: Issue[] = e.issues.map((i) => {
        const m = /^lines\.(\d+)\.(\w+)$/.exec(i.field);
        if (!m) return i;
        const isCounter = Number(m[1]) === counterIndex;
        const field =
          m[2] === "partyId"
            ? "partyId"
            : isCounter
              ? "counterAccountId"
              : input.type === "transfer" && Number(m[1]) === 0
                ? "toBankAccountId"
                : "bankAccountId";
        return { field, message: i.message };
      });
      throw new AccError(e.message, issues);
    }
  });
}
