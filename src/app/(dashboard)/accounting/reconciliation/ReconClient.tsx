"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import {
  completeReconciliationAction,
  confirmMatchAction,
  createAdjustmentAction,
  unmatchAction,
  voidReconciliationAction,
} from "@/lib/accounting/actions";
import { formatAmount } from "@/lib/accounting/money";
import type { ReconWorkspace, WsBookLine, WsStatementLine } from "@/lib/accounting/recon";
import { Combo, Label, useAct, type Option } from "@/components/accounting/kit";
import { Empty, Panel, Pill, Table, btn, btnDanger, btnPrimary, input, linkCls, rowCls, td, tdR, th, thR } from "@/components/accounting/ui";

type Ws = Pick<ReconWorkspace, "confirmed" | "suggestions" | "unrecordedStatement" | "outstandingBook" | "report">;
interface CounterOption extends Option {
  requiresParty: boolean;
}

export function ReconClient({
  bankAccountId,
  cutoff,
  closingBalance,
  ws,
  decimals,
  accounts,
  parties,
}: {
  bankAccountId: string;
  cutoff: string;
  closingBalance: number | null;
  ws: Ws;
  decimals: number;
  accounts: CounterOption[];
  parties: Option[];
}) {
  const router = useRouter();
  const act = useAct();
  const fmt = (n: number) => formatAmount(n, decimals);
  const [selS, setSelS] = useState<string[]>([]);
  const [selB, setSelB] = useState<string[]>([]);
  const [adjust, setAdjust] = useState<WsStatementLine | null>(null);
  const [adj, setAdj] = useState({ counterAccountId: "", partyId: "", description: "", approved: false });
  const [accept, setAccept] = useState(false);

  const sById = new Map(ws.unrecordedStatement.map((s) => [s.id, s]));
  const bById = new Map(ws.outstandingBook.map((b) => [b.id, b]));
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const totalS = selS.reduce((s, id) => s + (sById.get(id)?.amount ?? 0), 0);
  const totalB = selB.reduce((s, id) => s + (bById.get(id)?.amount ?? 0), 0);

  const match = async (s: string[], b: string[]) => {
    if (await act.run(() => confirmMatchAction(bankAccountId, s, b), "Match confirmed")) {
      setSelS([]);
      setSelB([]);
    }
  };
  async function confirmAllSuggested() {
    // each suggestion is still validated on the server (exact totals, no reuse)
    for (const sg of ws.suggestions.suggested) {
      const r = await confirmMatchAction(bankAccountId, [sg.statementId], [sg.bookId]);
      if (!r.ok) break;
    }
    router.refresh();
  }
  async function postAdjustment() {
    if (!adjust) return;
    const r = await act.run(
      () => createAdjustmentAction({ statementLineId: adjust.id, ...adj, partyId: adj.partyId || null }),
      "Adjusting entry posted and matched"
    );
    if (r) setAdjust(null);
  }
  async function complete() {
    if (closingBalance == null) return;
    const r = await act.run(
      () => completeReconciliationAction({ bankAccountId, cutoff, closingBalance, acceptUnrecorded: accept }),
      "Reconciliation completed"
    );
    if (r) router.push(`/accounting/reconciliation/${r.data}`);
  }

  const stmtCell = (s?: WsStatementLine) =>
    s && (
      <>
        <span className="whitespace-nowrap">{s.date}</span> · {s.description || "(no description)"}
        {s.reference && <span className="text-slate-500"> · ref {s.reference}</span>}
        {s.isOpening && <> <Pill tone="slate">Opening balance</Pill></>}
      </>
    );
  const bookCell = (b?: WsBookLine) =>
    b && (
      <>
        <span className="whitespace-nowrap">{b.date}</span> ·{" "}
        <Link href={`/accounting/journal/${b.entryId}`} className={linkCls}>
          {b.entryNumber}
        </Link>{" "}
        {b.description}
        {b.reference && <span className="text-slate-500"> · ref {b.reference}</span>}
      </>
    );
  const counter = accounts.find((a) => a.id === adj.counterAccountId);
  const canComplete = closingBalance != null && ws.report.difference === 0 && (ws.unrecordedStatement.length === 0 || accept);

  return (
    <div className="space-y-4">
      <Panel
        title={`Suggested matches (${ws.suggestions.suggested.length})`}
        actions={
          ws.suggestions.suggested.length > 1 && (
            <button type="button" className={btn} onClick={confirmAllSuggested} disabled={act.busy}>
              Confirm all suggested
            </button>
          )
        }
      >
        {ws.suggestions.suggested.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Statement</th>
                <th className={th}>Books</th>
                <th className={thR}>Amount</th>
                <th className={th}>Why</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {ws.suggestions.suggested.map((sg) => (
                <tr key={sg.statementId} className={rowCls}>
                  <td className={td}>{stmtCell(sById.get(sg.statementId))}</td>
                  <td className={td}>{bookCell(bById.get(sg.bookId))}</td>
                  <td className={tdR}>{fmt(sById.get(sg.statementId)?.amount ?? 0)}</td>
                  <td className={td + " text-slate-500"}>{sg.reasons.join(", ")}</td>
                  <td className={td + " text-right"}>
                    <button type="button" className={btnPrimary + " h-7 px-2"} disabled={act.busy} onClick={() => match([sg.statementId], [sg.bookId])}>
                      Confirm
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>No clear suggestions. Suggestions are never confirmed automatically.</Empty>
        )}
      </Panel>

      {ws.suggestions.ambiguous.length > 0 && (
        <Panel title={`Needs your decision (${ws.suggestions.ambiguous.length})`}>
          <p className="px-4 pt-3 text-[12px] text-slate-600">
            Several transactions share the same amount, so the amount alone cannot decide. Pick the right book transaction for each
            statement line, using the date, description and your documents.
          </p>
          <Table>
            <tbody>
              {ws.suggestions.ambiguous.map((am) => (
                <tr key={am.statementId} className={rowCls}>
                  <td className={td}>
                    {stmtCell(sById.get(am.statementId))}
                    <div className="tnum font-medium">{fmt(sById.get(am.statementId)?.amount ?? 0)}</div>
                    <div className="text-[12px] text-amber-700">{am.reason}</div>
                  </td>
                  <td className={td}>
                    <ul className="space-y-1">
                      {am.candidateBookIds.map((id) => (
                        <li key={id} className="flex items-start gap-2">
                          <button type="button" className={btn + " h-7 shrink-0 px-2"} disabled={act.busy} onClick={() => match([am.statementId], [id])}>
                            Match this
                          </button>
                          <span>{bookCell(bById.get(id))}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {ws.suggestions.amountDifferences.length > 0 && (
        <Panel title={`Potential amount differences (${ws.suggestions.amountDifferences.length})`}>
          <p className="px-4 pt-3 text-[12px] text-slate-600">
            Same reference, different amount. These cannot be matched as they are: correct the book entry (reverse and re-enter), or
            record the difference with an adjusting entry and match the group.
          </p>
          <Table>
            <thead>
              <tr>
                <th className={th}>Statement</th>
                <th className={thR}>Statement amount</th>
                <th className={th}>Books</th>
                <th className={thR}>Book amount</th>
                <th className={thR}>Difference</th>
              </tr>
            </thead>
            <tbody>
              {ws.suggestions.amountDifferences.map((d) => (
                <tr key={d.statementId} className={rowCls}>
                  <td className={td}>{stmtCell(sById.get(d.statementId))}</td>
                  <td className={tdR}>{fmt(sById.get(d.statementId)?.amount ?? 0)}</td>
                  <td className={td}>{bookCell(bById.get(d.bookId))}</td>
                  <td className={tdR}>{fmt(bById.get(d.bookId)?.amount ?? 0)}</td>
                  <td className={tdR + " font-semibold text-red-700"}>{fmt(d.difference)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`Statement transactions missing from the books (${ws.unrecordedStatement.length})`}>
          {ws.unrecordedStatement.length ? (
            <Table>
              <tbody>
                {ws.unrecordedStatement.map((s) => (
                  <tr key={s.id} className={rowCls}>
                    <td className={td}>
                      {s.matchId ? (
                        <Pill tone="slate">Matched after cutoff</Pill>
                      ) : (
                        <input type="checkbox" aria-label={`Select statement line ${s.date} ${s.description}`} checked={selS.includes(s.id)} onChange={() => toggle(selS, setSelS, s.id)} />
                      )}
                    </td>
                    <td className={td}>
                      {stmtCell(s)} {s.duplicateFlag && <Pill tone="amber">Likely duplicate</Pill>}
                    </td>
                    <td className={tdR}>{fmt(s.amount)}</td>
                    <td className={td + " text-right"}>
                      {!s.matchId && !s.isOpening && (
                        <button
                          type="button"
                          className={btn + " h-7 px-2"}
                          onClick={() => {
                            act.clear();
                            setAdj({ counterAccountId: "", partyId: "", description: s.description, approved: false });
                            setAdjust(s);
                          }}
                        >
                          Record…
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>Every statement transaction up to the cutoff is matched.</Empty>
          )}
        </Panel>
        <Panel title={`Book transactions missing from the statement (${ws.outstandingBook.length})`}>
          {ws.outstandingBook.length ? (
            <Table>
              <tbody>
                {ws.outstandingBook.map((b) => (
                  <tr key={b.id} className={rowCls}>
                    <td className={td}>
                      {b.matchId ? (
                        <Pill tone="slate">Matched after cutoff</Pill>
                      ) : (
                        <input type="checkbox" aria-label={`Select book transaction ${b.entryNumber}`} checked={selB.includes(b.id)} onChange={() => toggle(selB, setSelB, b.id)} />
                      )}
                    </td>
                    <td className={td}>{bookCell(b)}</td>
                    <td className={tdR}>{fmt(b.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>Every book transaction up to the cutoff is matched.</Empty>
          )}
        </Panel>
      </div>

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[13px] shadow-md print:hidden">
        <span>
          Selected: statement <strong className="tnum">{fmt(totalS)}</strong> ({selS.length}) · books{" "}
          <strong className="tnum">{fmt(totalB)}</strong> ({selB.length})
        </span>
        {selS.length > 0 && selB.length > 0 && totalS !== totalB && (
          <span className="font-medium text-red-700">Totals differ by {fmt(Math.abs(totalS - totalB))}; a match must agree exactly.</span>
        )}
        <button
          type="button"
          className={btnPrimary + " ml-auto"}
          disabled={act.busy || !selS.length || !selB.length || totalS !== totalB}
          onClick={() => match(selS, selB)}
        >
          Match selected
        </button>
      </div>

      <Panel title={`Confirmed matches (${ws.confirmed.length})`}>
        {ws.confirmed.length ? (
          <Table>
            <thead>
              <tr>
                <th className={th}>Statement</th>
                <th className={th}>Books</th>
                <th className={thR}>Total</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {ws.confirmed.map((m) => (
                <tr key={m.id} className={rowCls}>
                  <td className={td}>
                    {m.statement.map((s) => (
                      <div key={s.id}>{stmtCell(s)}</div>
                    ))}
                  </td>
                  <td className={td}>
                    {m.book.map((b) => (
                      <div key={b.id}>{bookCell(b)}</div>
                    ))}
                  </td>
                  <td className={tdR}>{fmt(m.statement.reduce((s, x) => s + x.amount, 0))}</td>
                  <td className={td + " text-right"}>
                    {m.reconciliationId ? (
                      <Pill tone="green">Reconciled</Pill>
                    ) : (
                      <button type="button" className={btn + " h-7 px-2"} disabled={act.busy} onClick={() => act.run(() => unmatchAction(m.id), "Match removed")}>
                        Unmatch
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>No confirmed matches up to this cutoff yet.</Empty>
        )}
      </Panel>

      <Panel title="Complete this reconciliation">
        <div className="space-y-3 p-4 text-[13px]">
          {closingBalance == null && <p className="text-slate-600">Enter the statement closing balance above to see the difference.</p>}
          {closingBalance != null && ws.report.difference !== 0 && (
            <p className="font-medium text-red-700">
              A difference of {fmt(ws.report.difference ?? 0)} is unexplained, so this reconciliation cannot be completed.
            </p>
          )}
          {ws.unrecordedStatement.length > 0 && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>
                I have reviewed the {ws.unrecordedStatement.length} statement item(s) that are not in the books and accept them as open
                items on this reconciliation. (Normally you record them first.)
              </span>
            </label>
          )}
          {act.err("acceptUnrecorded") && <p className="text-[12px] font-medium text-red-700">{act.err("acceptUnrecorded")}</p>}
          <button type="button" className={btnPrimary} disabled={!canComplete || act.busy} onClick={complete}>
            {act.busy ? "Working…" : `Complete reconciliation to ${cutoff}`}
          </button>
        </div>
      </Panel>

      <Modal
        open={!!adjust}
        onClose={() => setAdjust(null)}
        title="Record a statement item in the books"
        description="For items that only the bank knows about, such as fees or interest. You choose the account and approve the posting."
        footer={
          <>
            <button type="button" className={btn} onClick={() => setAdjust(null)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={postAdjustment} disabled={act.busy || !adj.approved}>
              {act.busy ? "Posting…" : "Post adjusting entry"}
            </button>
          </>
        }
      >
        {adjust && (
          <div className="space-y-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
              {adjust.date} · {adjust.description} ·{" "}
              <strong className="tnum">
                {fmt(Math.abs(adjust.amount))} {adjust.amount > 0 ? "received" : "paid"}
              </strong>
            </p>
            <Label label={adjust.amount > 0 ? "Account to credit (e.g. interest income)" : "Account to debit (e.g. bank fees)"} error={act.err("counterAccountId")}>
              <Combo options={accounts} value={adj.counterAccountId} onChange={(id) => setAdj({ ...adj, counterAccountId: id })} placeholder="Code or name" />
            </Label>
            {counter?.requiresParty && (
              <Label label="Party (required)" error={act.err("partyId")}>
                <Combo options={parties} value={adj.partyId} onChange={(id) => setAdj({ ...adj, partyId: id })} />
              </Label>
            )}
            <Label label="Description" error={act.err("description")}>
              <input className={input} value={adj.description} onChange={(e) => setAdj({ ...adj, description: e.target.value })} />
            </Label>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" className="mt-0.5" checked={adj.approved} onChange={(e) => setAdj({ ...adj, approved: e.target.checked })} />
              <span>
                I approve posting a journal entry dated {adjust.date} for {fmt(Math.abs(adjust.amount))} between the bank account and the
                account chosen above.
              </span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function VoidReconciliationButton({ id }: { id: string }) {
  const act = useAct();
  return (
    <button
      type="button"
      className={btnDanger}
      disabled={act.busy}
      onClick={() => {
        const reason = prompt("Voiding keeps this report in the history and frees its matches for changes.\nReason for voiding:");
        if (reason !== null) act.run(() => voidReconciliationAction(id, reason), "Reconciliation voided");
      }}
    >
      Void reconciliation
    </button>
  );
}
