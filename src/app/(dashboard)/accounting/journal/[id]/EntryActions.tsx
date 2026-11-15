"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Paperclip, Printer, Trash2, Undo2 } from "lucide-react";
import { Modal } from "@/components/ui";
import {
  addAttachmentAction,
  deleteAttachmentAction,
  duplicateEntryAction,
  reverseEntryAction,
} from "@/lib/accounting/actions";
import { Label, useAct } from "@/components/accounting/kit";
import { btn, btnDanger, btnPrimary, input, linkCls } from "@/components/accounting/ui";

export function EntryActions({
  id,
  entryNumber,
  canReverse,
  today,
}: {
  id: string;
  entryNumber: string;
  canReverse: boolean;
  today: string;
}) {
  const router = useRouter();
  const act = useAct();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");

  async function duplicate() {
    const r = await act.run(() => duplicateEntryAction(id), "Copied into a new draft");
    if (r) router.push(`/accounting/journal/${r.data.id}`);
  }
  async function reverse() {
    const r = await act.run(() => reverseEntryAction(id, date, description), "Entry reversed");
    if (r) {
      setOpen(false);
      router.push(`/accounting/journal/${r.data.id}`);
    }
  }

  return (
    <>
      <button type="button" className={btn} onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print
      </button>
      <button type="button" className={btn} onClick={duplicate} disabled={act.busy}>
        <Copy className="h-4 w-4" /> Duplicate
      </button>
      {canReverse && (
        <button type="button" className={btnDanger} onClick={() => setOpen(true)}>
          <Undo2 className="h-4 w-4" /> Reverse
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Reverse ${entryNumber}`}
        description="A linked entry with opposite amounts is posted. The original stays in the books, so both remain visible and net to zero."
        footer={
          <>
            <button type="button" className={btn} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={reverse} disabled={act.busy}>
              {act.busy ? "Posting…" : "Post reversal"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Label label="Reversal date (must be in an open period)" error={act.err("date")}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </Label>
          <Label label="Description (optional)">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={input}
              placeholder={`Reversal of ${entryNumber}`}
            />
          </Label>
          <p className="text-[12px] text-slate-500">
            To correct an entry: reverse it, then use Duplicate on the original to start a corrected replacement.
          </p>
        </div>
      </Modal>
    </>
  );
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  size: number;
}

export function Attachments({
  entryId,
  attachments,
  canDelete,
}: {
  entryId: string;
  attachments: AttachmentInfo[];
  canDelete: boolean;
}) {
  const act = useAct();
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("entryId", entryId);
    form.set("file", file);
    await act.run(() => addAttachmentAction(form), "Attachment added");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="p-4">
      {attachments.length === 0 && <p className="mb-3 text-[13px] text-slate-500">No supporting documents attached.</p>}
      <ul className="mb-3 space-y-1.5">
        {attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[13px]">
            <Paperclip className="h-3.5 w-3.5 text-slate-400" />
            <a href={`/api/accounting/attachments/${a.id}`} className={linkCls}>
              {a.filename}
            </a>
            <span className="text-slate-400">{Math.max(1, Math.round(a.size / 1024))} KB</span>
            {canDelete && (
              <button
                type="button"
                className="rounded p-1 text-slate-400 hover:text-red-600 print:hidden"
                aria-label={`Remove ${a.filename}`}
                disabled={act.busy}
                onClick={() => confirm(`Remove ${a.filename}?`) && act.run(() => deleteAttachmentAction(a.id), "Attachment removed")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <label className="block text-[12px] font-medium text-slate-600 print:hidden">
        Add a document (PDF, image, TXT, CSV or XLSX, up to 5 MB)
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx"
          disabled={act.busy}
          onChange={(e) => upload(e.target.files?.[0])}
          className="mt-1 block text-[13px] file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
        />
      </label>
    </div>
  );
}
