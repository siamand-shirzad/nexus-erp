"use client";

import { useState } from "react";
import Link from "next/link";
import { quickTransactionAction } from "@/lib/accounting/actions";
import { parseAmount } from "@/lib/accounting/money";
import type { FormOptions } from "@/lib/accounting/options";
import type { QuickType } from "@/lib/accounting/quick";
import { AmountInput, Combo, Label, useAct } from "@/components/accounting/kit";
import { Panel, btnPrimary, input, linkCls } from "@/components/accounting/ui";
import { cn } from "@/lib/utils";

const TYPES: Array<{ type: QuickType; label: string; bank: string; counter: string; help: string }> = [
  {
    type: "receipt",
    label: "Money received",
    bank: "Received into",
    counter: "Received for (account credited)",
    help: "Not every receipt is income. Customer paying what they owe: choose Accounts Receivable and the customer. Owner putting money in: Owner's Capital. A new loan: Loans Payable. Only choose an income account for income that was not already recorded as a receivable.",
  },
  {
    type: "payment",
    label: "Money paid",
    bank: "Paid from",
    counter: "Paid for (account debited)",
    help: "Not every payment is an expense. Paying a supplier you owe: choose Accounts Payable and the supplier. Owner taking money out: Owner's Drawings. Repaying a loan: Loans Payable.",
  },
  {
    type: "expense",
    label: "Expense payment",
    bank: "Paid from",
    counter: "Expense account",
    help: "An expense paid immediately from a bank or cash account. For bills you will pay later, record the payable with a journal entry first.",
  },
  {
    type: "transfer",
    label: "Transfer",
    bank: "From account",
    counter: "",
    help: "Moves money between your own bank and cash accounts. It changes two asset accounts and is never income or expense.",
  },
];

export function QuickForms({ options, decimals, today, currency }: { options: FormOptions; decimals: number; today: string; currency: string }) {
  const act = useAct();
  const [type, setType] = useState<QuickType>("receipt");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBank] = useState(options.banks[0]?.id ?? "");
  const [toBankAccountId, setToBank] = useState("");
  const [counterAccountId, setCounter] = useState("");
  const [partyId, setParty] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [amountError, setAmountError] = useState("");
  const [last, setLast] = useState<{ id: string; entryNumber: string | null } | null>(null);

  const t = TYPES.find((x) => x.type === type)!;
  const counterOptions = options.accounts.filter(
    (a) => !a.isBank && (type !== "expense" || a.category === "expense")
  );
  const counter = options.accounts.find((a) => a.id === counterAccountId);
  const showParty = type !== "transfer" && (type !== "expense" || counter?.requiresParty);

  function switchType(next: QuickType) {
    setType(next);
    setCounter("");
    setParty("");
    act.clear();
  }

  async function submit() {
    const minor = parseAmount(amount, decimals);
    if (minor === null || minor <= 0) {
      setAmountError(`Enter an amount greater than zero (up to ${decimals} decimal place(s)).`);
      return;
    }
    setAmountError("");
    const r = await act.run(
      () =>
        quickTransactionAction({
          type,
          date,
          amount: minor,
          bankAccountId,
          toBankAccountId,
          counterAccountId,
          partyId: showParty ? partyId || null : null,
          reference,
          description,
          idempotencyKey: key,
        }),
      `${t.label} posted`
    );
    if (!r) return;
    setLast(r.data);
    setAmount("");
    setReference("");
    setDescription("");
    setKey(crypto.randomUUID()); // next submission is a new transaction
  }

  return (
    <Panel>
      <div role="tablist" aria-label="Transaction type" className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
        {TYPES.map((x) => (
          <button
            key={x.type}
            role="tab"
            type="button"
            aria-selected={type === x.type}
            onClick={() => switchType(x.type)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600",
              type === x.type ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <form
        className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600 sm:col-span-2 lg:col-span-3">{t.help}</p>
        <Label label="Date" error={act.err("date")}>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </Label>
        <Label label={`Amount (${currency})`} error={amountError || act.err("amount")}>
          <AmountInput value={amount} onChange={setAmount} invalid={!!amountError} />
        </Label>
        <Label label={t.bank} error={act.err("bankAccountId")}>
          <select value={bankAccountId} onChange={(e) => setBank(e.target.value)} className={input} required>
            {options.banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Label>
        {type === "transfer" ? (
          <Label label="To account" error={act.err("toBankAccountId")}>
            <select value={toBankAccountId} onChange={(e) => setToBank(e.target.value)} className={input} required>
              <option value="">Choose…</option>
              {options.banks
                .filter((b) => b.id !== bankAccountId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
            </select>
          </Label>
        ) : (
          <Label label={t.counter} error={act.err("counterAccountId")}>
            <Combo
              key={type}
              options={counterOptions}
              value={counterAccountId}
              onChange={setCounter}
              placeholder="Code or name"
              invalid={!!act.err("counterAccountId")}
            />
          </Label>
        )}
        {showParty && (
          <Label label={counter?.requiresParty ? "Party (required)" : "Party (optional)"} error={act.err("partyId")}>
            <Combo options={options.parties} value={partyId} onChange={setParty} invalid={!!act.err("partyId")} />
          </Label>
        )}
        <Label label="Reference (optional)">
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} placeholder="Receipt, cheque or transfer no." />
        </Label>
        <Label label="Description" error={act.err("description")} className="sm:col-span-2">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={input} placeholder={t.label} />
        </Label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <button type="submit" className={btnPrimary} disabled={act.busy || !options.banks.length}>
            {act.busy ? "Posting…" : `Post ${t.label.toLowerCase()}`}
          </button>
          {last && (
            <span className="text-[13px] text-slate-600" role="status">
              Posted as{" "}
              <Link href={`/accounting/journal/${last.id}`} className={linkCls}>
                {last.entryNumber}
              </Link>
            </span>
          )}
        </div>
      </form>
    </Panel>
  );
}
