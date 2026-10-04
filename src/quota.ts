/**
 * Freemium enforcement: in-memory monthly usage tracking.
 *
 * Every estimate_* / clawback_check tool call consumes one estimate from the
 * subscriber's monthly quota. The limit is set via the FREE_MONTHLY_LIMIT
 * environment variable (default 5); Pro subscribers get unlimited (enforced
 * by the marketplace subscription, which sets this env var to a high value).
 *
 * Counters are keyed by UTC calendar month and reset automatically when the
 * month rolls over. In-memory by design — see README limitations.
 */

const DEFAULT_FREE_MONTHLY_LIMIT = 5;

const usage = new Map<string, number>();

function freeLimit(): number {
  const raw = process.env.FREE_MONTHLY_LIMIT;
  const parsed = raw != null && raw !== "" ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FREE_MONTHLY_LIMIT;
}

function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  limit: number;
  month: string;
}

/** Consume one estimate. Returns {allowed:false} when the free quota is spent. */
export function consumeEstimate(): QuotaCheck {
  const limit = freeLimit();
  const month = monthKey();
  const used = usage.get(month) ?? 0;
  if (used >= limit) {
    return { allowed: false, used, limit, month };
  }
  usage.set(month, used + 1);
  return { allowed: true, used: used + 1, limit, month };
}

/** Read-only view of current usage (used by tests). */
export function quotaStatus(): QuotaCheck {
  const limit = freeLimit();
  const month = monthKey();
  return { allowed: (usage.get(month) ?? 0) < limit, used: usage.get(month) ?? 0, limit, month };
}

/** Test hook: reset usage for a month (tests only). */
export function _resetUsage(month?: string): void {
  if (month) usage.delete(month);
  else usage.clear();
}
