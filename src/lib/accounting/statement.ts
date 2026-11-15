// Pure parsing of bank statement files (CSV / XLSX) into normalised statement rows.
// Nothing here guesses: the date format and the meaning of amount signs are chosen by the user.
import { fail, isIsoDate } from "./core";
import { parseAmount } from "./money";

export type Cell = string | number | Date | null;
export interface ParsedFile {
  headers: string[];
  rows: Cell[][]; // data rows, header excluded
}

export type DateFormat = "YMD" | "DMY" | "MDY";
export interface StatementMapping {
  /** column indexes */
  date: number;
  description: number | null;
  reference: number | null;
  externalId: number | null;
  balance: number | null;
  dateFormat: DateFormat;
  amountMode: "signed" | "split";
  // signed: one column, the user states what a positive number means
  amount?: number | null;
  positiveMeans?: "deposit" | "withdrawal";
  // split: separate columns
  deposit?: number | null;
  withdrawal?: number | null;
}

export interface StatementRow {
  rowNo: number; // row number in the file (header = 1)
  date: string;
  description: string;
  reference: string | null;
  externalId: string | null;
  /** normalised: > 0 deposit (money in), < 0 withdrawal (money out) */
  amount: number;
  runningBalance: number | null;
}
export interface RowError {
  rowNo: number;
  message: string;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function xlsxCell(v: unknown): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  const o = v as Record<string, unknown>;
  if ("result" in o) return xlsxCell(o.result);
  if (Array.isArray(o.richText))
    return (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
  if ("text" in o) return String(o.text);
  return String(v);
}

export async function parseStatementFile(filename: string, bytes: Uint8Array): Promise<ParsedFile> {
  const ext = filename.split(".").pop()?.toLowerCase();
  let table: Cell[][];
  if (ext === "csv") {
    table = parseCsv(new TextDecoder("utf-8").decode(bytes));
  } else if (ext === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(Buffer.from(bytes) as never);
    } catch {
      fail("This file could not be read as an Excel workbook.");
    }
    const ws = wb.worksheets[0];
    if (!ws) fail("The workbook has no sheets.");
    table = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const out: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) out.push(xlsxCell(row.getCell(c).value));
      table.push(out);
    });
  } else {
    fail("Upload a .csv or .xlsx file.");
  }
  if (table.length < 2) fail("The file needs a header row and at least one transaction row.");
  const width = Math.max(...table.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = table[0][i];
    return h == null || String(h).trim() === "" ? `Column ${i + 1}` : String(h).trim();
  });
  return { headers, rows: table.slice(1) };
}

const isBlank = (c: Cell | undefined) => c == null || (typeof c === "string" && c.trim() === "");
const text = (c: Cell | undefined) =>
  c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim();

function parseDate(c: Cell | undefined, format: DateFormat): string | null {
  if (c instanceof Date) {
    // a real spreadsheet date is unambiguous
    return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  }
  if (typeof c !== "string") return null;
  const parts = c.trim().split(/[-/.]/);
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [a, b, d] = parts;
  const [y, m, day] = format === "YMD" ? [a, b, d] : format === "DMY" ? [d, b, a] : [d, a, b];
  if (y.length !== 4) return null; // two-digit years are ambiguous
  const iso = `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/** undefined = empty cell, null = present but not a valid amount */
function parseMoney(c: Cell | undefined, decimals: number): number | null | undefined {
  if (isBlank(c)) return undefined;
  if (c instanceof Date) return null;
  // numeric spreadsheet cells are converted through their decimal text, never used in arithmetic
  if (typeof c === "number") {
    if (!Number.isFinite(c)) return null;
    const fixed = c.toFixed(decimals);
    if (Math.abs(Number(fixed) - c) > 1e-9) return null; // more precision than the currency allows
    return parseAmount(fixed, decimals);
  }
  return parseAmount(c as string, decimals);
}

export function mapRows(file: ParsedFile, m: StatementMapping, decimals: number) {
  const rows: StatementRow[] = [];
  const errors: RowError[] = [];
  let blank = 0;
  const col = (r: Cell[], i: number | null | undefined) => (i == null || i < 0 ? undefined : r[i]);

  file.rows.forEach((r, idx) => {
    const rowNo = idx + 2;
    if (r.every(isBlank)) {
      blank++;
      return;
    }
    const problems: string[] = [];
    const date = parseDate(col(r, m.date), m.dateFormat);
    if (!date)
      problems.push(`date "${text(col(r, m.date))}" does not match the selected format`);

    let amount: number | null = null;
    if (m.amountMode === "signed") {
      const v = parseMoney(col(r, m.amount), decimals);
      if (v === undefined) problems.push("amount is empty");
      else if (v === null) problems.push(`amount "${text(col(r, m.amount))}" is not a valid number`);
      else amount = m.positiveMeans === "withdrawal" ? -v : v;
    } else {
      const dep = parseMoney(col(r, m.deposit), decimals);
      const wd = parseMoney(col(r, m.withdrawal), decimals);
      if (dep === null) problems.push(`deposit "${text(col(r, m.deposit))}" is not a valid number`);
      if (wd === null) problems.push(`withdrawal "${text(col(r, m.withdrawal))}" is not a valid number`);
      const d = Math.abs(dep ?? 0);
      const w = Math.abs(wd ?? 0);
      if (dep !== null && wd !== null) {
        if (d && w) problems.push("both a deposit and a withdrawal are filled in");
        else if (!d && !w) problems.push("neither a deposit nor a withdrawal is filled in");
        else amount = d - w;
      }
    }
    if (amount === 0) problems.push("amount is zero");

    let runningBalance: number | null = null;
    if (m.balance != null) {
      const b = parseMoney(col(r, m.balance), decimals);
      if (b === null) problems.push(`balance "${text(col(r, m.balance))}" is not a valid number`);
      else runningBalance = b ?? null;
    }

    if (problems.length || !date || amount === null) {
      errors.push({ rowNo, message: problems.join("; ") });
      return;
    }
    rows.push({
      rowNo,
      date,
      description: text(col(r, m.description)),
      reference: text(col(r, m.reference)) || null,
      externalId: text(col(r, m.externalId)) || null,
      amount,
      runningBalance,
    });
  });

  // a transaction identifier must be unique inside the file
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (!row.externalId) continue;
    const first = seen.get(row.externalId);
    if (first) errors.push({ rowNo: row.rowNo, message: `transaction id "${row.externalId}" repeats row ${first}` });
    else seen.set(row.externalId, row.rowNo);
  }
  errors.sort((a, b) => a.rowNo - b.rowNo);
  return { rows, errors, blank };
}

export function validateMapping(m: StatementMapping, width: number) {
  const ok = (i: number | null | undefined) => Number.isInteger(i) && i! >= 0 && i! < width;
  if (!ok(m.date)) fail("Choose the date column.", "date");
  if (!["YMD", "DMY", "MDY"].includes(m.dateFormat)) fail("Choose the date format.", "dateFormat");
  if (m.amountMode === "signed") {
    if (!ok(m.amount)) fail("Choose the amount column.", "amount");
    if (m.positiveMeans !== "deposit" && m.positiveMeans !== "withdrawal")
      fail("State whether a positive amount is a deposit or a withdrawal.", "positiveMeans");
  } else if (m.amountMode === "split") {
    if (!ok(m.deposit)) fail("Choose the deposit column.", "deposit");
    if (!ok(m.withdrawal)) fail("Choose the withdrawal column.", "withdrawal");
    if (m.deposit === m.withdrawal) fail("Deposit and withdrawal must be different columns.", "withdrawal");
  } else fail("Choose how amounts are laid out.", "amountMode");
  for (const k of ["description", "reference", "externalId", "balance"] as const)
    if (m[k] != null && !ok(m[k])) fail(`Invalid ${k} column.`, k);
}
