// Server-safe presentational pieces for accounting screens (no hooks, no "use client").
import Link from "next/link";
import type { ReactNode } from "react";
import { formatAmount } from "@/lib/accounting/money";
import { cn } from "@/lib/utils";

export const th =
  "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap";
export const thR = cn(th, "text-right");
export const td = "px-3 py-1.5 align-top text-slate-700";
export const tdR = cn(td, "text-right tnum whitespace-nowrap");
export const rowCls = "border-t border-slate-100 hover:bg-indigo-50/40";
export const totalRow = "border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900";
export const input =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100";
export const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50";
export const btnPrimary =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-[13px] font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";
export const btnDanger =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 text-[13px] font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50";
export const linkCls = "font-medium text-indigo-700 hover:underline";

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white print:border-0", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)}>{children}</table>
    </div>
  );
}

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

/** A plain amount; zero renders blank by default so debit/credit columns stay readable. */
export function Money({ value, decimals, zero = "" }: { value: number; decimals: number; zero?: string }) {
  return <>{value === 0 ? zero : formatAmount(value, decimals)}</>;
}

/** A debit-positive balance shown as an absolute amount with a Dr / Cr label. */
export function Balance({ value, decimals }: { value: number; decimals: number }) {
  if (value === 0) return <>{formatAmount(0, decimals)}</>;
  return (
    <>
      {formatAmount(Math.abs(value), decimals)}{" "}
      <span className={cn("text-[11px] font-semibold", value > 0 ? "text-slate-500" : "text-amber-700")}>
        {value > 0 ? "Dr" : "Cr"}
      </span>
    </>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-[13px] text-slate-500">{children}</p>;
}

export function Pill({ tone, children }: { tone: "slate" | "green" | "amber" | "red" | "indigo"; children: ReactNode }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    indigo: "bg-indigo-100 text-indigo-800",
  };
  return (
    <span className={cn("inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export function EntryStatus({ status, reversed }: { status: string; reversed?: boolean }) {
  if (status === "draft") return <Pill tone="amber">Draft</Pill>;
  if (reversed) return <Pill tone="red">Reversed</Pill>;
  return <Pill tone="green">Posted</Pill>;
}

export const KIND_LABEL: Record<string, string> = {
  manual: "Manual",
  opening: "Opening balance",
  receipt: "Money received",
  payment: "Money paid",
  expense: "Expense",
  transfer: "Transfer",
  reversal: "Reversal",
  adjustment: "Bank adjustment",
  closing: "Year-end closing",
};

/** Timestamp in the server's local time zone, "YYYY-MM-DD HH:MM:SS". */
export const stamp = (d: Date) => d.toLocaleString("sv-SE");

export function ledgerHref(p: { account?: string; party?: string; from?: string; to?: string }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  return `/accounting/reports/ledger?${q}`;
}

export function EntryLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link href={`/accounting/journal/${id}`} className={linkCls}>
      {children}
    </Link>
  );
}

export function Stat({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  hint?: ReactNode;
}) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 tnum">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border border-slate-200 bg-white px-4 py-3";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Label + control for plain GET filter forms. */
export function F({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block text-[12px] font-medium text-slate-600", className)}>
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
