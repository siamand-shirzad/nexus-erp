// Money helpers. Amounts are integers in minor units (e.g. rials with 0 decimals,
// or cents with 2). All parsing/formatting is string/integer based — no float arithmetic.

const LOCAL_DIGITS = /[۰-۹٠-٩]/g;
const toLatin = (s: string) =>
  s.replace(LOCAL_DIGITS, (d) => String(d.charCodeAt(0) & 0xf));

/**
 * Parses user/bank text such as "1,234,500", "-1200.50" or "(350)" into minor units.
 * Returns null when the text is not a valid amount for the given precision.
 */
export function parseAmount(input: string, decimals: number): number | null {
  let s = toLatin(String(input ?? "")).trim().replace(/\s/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  // digits with optional thousands commas, optional decimal part
  if (!/^(\d+|\d{1,3}(,\d{3})+)(\.\d*)?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace(/,/g, "").split(".");
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) return null;
  const minorText = whole + frac.slice(0, decimals).padEnd(decimals, "0");
  if (minorText.replace(/^0+/, "").length > 15) return null; // stay inside exact integer range
  const minor = Number(minorText);
  if (!Number.isSafeInteger(minor)) return null;
  return negative && minor !== 0 ? -minor : minor;
}

/** Formats minor units as a grouped decimal string, e.g. 123450 (2 decimals) -> "1,234.50". */
export function formatAmount(minor: number, decimals: number): string {
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = decimals ? "." + digits.slice(-decimals) : "";
  return (negative ? "-" : "") + whole + frac;
}

/** Plain decimal text without grouping, for form inputs. */
export function amountToInput(minor: number, decimals: number): string {
  return formatAmount(minor, decimals).replace(/,/g, "");
}

/** Display-only conversion for spreadsheet cells. Never use the result in calculations. */
export function toMajor(minor: number, decimals: number): number {
  return Number(amountToInput(minor, decimals));
}

/**
 * Sign convention used everywhere: a balance is debits minus credits.
 * Positive = debit balance (Dr), negative = credit balance (Cr).
 */
export function drCr(balance: number, decimals: number): string {
  if (balance === 0) return formatAmount(0, decimals);
  return `${formatAmount(Math.abs(balance), decimals)} ${balance > 0 ? "Dr" : "Cr"}`;
}
