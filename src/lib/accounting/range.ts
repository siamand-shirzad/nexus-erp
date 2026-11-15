import { isIsoDate, todayIso } from "./core";
import { listFiscalYears } from "./setup";

export type Params = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Date range from the query string; defaults to the current fiscal year to date. */
export async function rangeFrom(params: Record<string, string | string[] | undefined>) {
  const today = todayIso();
  const years = await listFiscalYears();
  const current = years.find((y) => y.startDate <= today && y.endDate >= today);
  const from = one(params.from);
  const to = one(params.to);
  return {
    from: isIsoDate(from) ? from : (current?.startDate ?? today.slice(0, 8) + "01"),
    to: isIsoDate(to) ? to : today,
    today,
  };
}
