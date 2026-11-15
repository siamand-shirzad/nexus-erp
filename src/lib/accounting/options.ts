import { listAccounts, listBankAccounts, listParties } from "./masterdata";

/** Selector options for entry forms: active posting accounts and active parties, with unique labels. */
export async function formOptions() {
  const [accounts, parties, banks] = await Promise.all([listAccounts(), listParties(), listBankAccounts()]);
  const bankLedger = new Set(banks.map((b) => b.accountId));
  const seen = new Map<string, number>();
  const unique = (label: string) => {
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label} #${n}`;
  };
  return {
    accounts: accounts
      .filter((a) => a.postable && a.isActive)
      .map((a) => ({
        id: a.id,
        label: `${a.code} · ${a.name}`,
        requiresParty: a.requiresParty,
        category: a.category,
        isBank: bankLedger.has(a.id),
      })),
    parties: parties
      .filter((p) => p.isActive)
      .map((p) => ({ id: p.id, label: unique(p.code ? `${p.name} (${p.code})` : p.name) })),
    banks: banks
      .filter((b) => b.isActive)
      .map((b) => ({ id: b.id, label: `${b.name} (${b.accountCode})`, kind: b.kind, accountId: b.accountId })),
  };
}
export type FormOptions = Awaited<ReturnType<typeof formOptions>>;
