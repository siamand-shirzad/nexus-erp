"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { useToast } from "@/components/toast";
import type { ActionResult } from "@/lib/accounting/actions";
import type { Issue } from "@/lib/accounting/core";
import { cn } from "@/lib/utils";
import { btn, input } from "./ui";

/** Runs a server action with a busy flag (blocks double submission), toasts, and field issues. */
export function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);

  async function run<T>(fn: () => Promise<ActionResult<T>>, success?: string) {
    if (busy) return null;
    setBusy(true);
    setIssues([]);
    try {
      const r = await fn();
      if (!r.ok) {
        setIssues(r.issues);
        toast.error(r.error);
        return null;
      }
      if (success) toast.success(success);
      router.refresh();
      return r;
    } catch {
      toast.error("The request failed. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  const err = (field: string) => issues.find((i) => i.field === field)?.message;
  return { run, busy, issues, err, clear: () => setIssues([]) };
}

export function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1 text-[12px] font-medium text-red-700">
      {message}
    </p>
  ) : null;
}

export function Label({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block text-[12px] font-medium text-slate-600", className)}>
      <span className="mb-1 block">{label}</span>
      {children}
      <FieldError message={error} />
    </label>
  );
}

export interface Option {
  id: string;
  label: string;
}

/**
 * Searchable selector built on the native <datalist>: type any part of the code or name,
 * pick with the keyboard. The value is only set when the text matches an option exactly.
 */
export function Combo({
  options,
  value,
  onChange,
  placeholder = "Type to search…",
  invalid,
  ariaLabel,
  disabled,
}: {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  invalid?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? "";
  const [text, setText] = useState(labelOf(value));
  // when the value is changed from outside (reset, edit), show its label
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (options.find((o) => o.label === text)?.id !== value) setText(labelOf(value));
  }
  const unmatched = text.trim() !== "" && !value;
  return (
    <>
      <input
        className={cn(input, (invalid || unmatched) && "border-red-500 focus:border-red-500 focus:ring-red-200")}
        list={listId}
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || unmatched}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          onChange(options.find((o) => o.label === e.target.value)?.id ?? "");
        }}
        onBlur={() => {
          // accept a unique partial match so typing a code and tabbing away is enough
          if (value || !text.trim()) return;
          const q = text.trim().toLowerCase();
          const hits = options.filter((o) => o.label.toLowerCase().includes(q));
          if (hits.length === 1) {
            setText(hits[0].label);
            onChange(hits[0].id);
          }
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>
    </>
  );
}

export function AmountInput({
  value,
  onChange,
  invalid,
  ariaLabel,
  placeholder = "0",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      className={cn(input, "text-right tnum", invalid && "border-red-500 focus:border-red-500 focus:ring-red-200")}
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      disabled={disabled}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Excel export of the table on screen, plus the browser's print / save-as-PDF view. */
export function ExportButtons({
  title,
  meta,
  columns,
  rows,
}: {
  title: string;
  meta?: string[];
  columns: string[];
  rows: Array<Array<string | number | null>>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function excel() {
    setBusy(true);
    try {
      const res = await fetch("/api/accounting/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, meta, columns, rows }),
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "report"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" className={btn} onClick={excel} disabled={busy || !rows.length}>
        <Download className="h-4 w-4" /> Excel
      </button>
      <button type="button" className={btn} onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print / PDF
      </button>
    </div>
  );
}
