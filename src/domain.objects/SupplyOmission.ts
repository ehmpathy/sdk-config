import type { SupplyError } from './SupplyError';

/**
 * .what = why a config supply was unreadable: 'absent' = not-found, 'denied' =
 *         authz-denied. decided by the supplier's error class.
 */
export type SupplyReason = 'absent' | 'denied';

/**
 * .what = a config supply that was omitted — its `$.at()` value could not be read
 *         (absent or denied), so it was left `undefined` in place. `key.path` is
 *         the dot-delimited config keyPath; `reason` is why the read missed;
 *         `cause` is the supplier error that fill caught and tolerated.
 * .why = the fundamental, verdict-free fact — true before any schema speaks. fill
 *        records one omission per unreadable key. whether an omission is tolerated
 *        or a hard failure is a separate call the schema renders (see
 *        SupplyTolerance); the omission itself carries no verdict.
 *
 * .note = `cause` is the exact `SupplyError` fill tolerated. `reason` is its flat,
 *         generic tag (absent vs denied) for ergonomic reads + stable snapshots;
 *         `cause` carries the supplier-specific particulars (e.g. an AWS
 *         AccessDeniedException's ARN + request-id) for on-call to act without a
 *         re-run. because the cause message is volatile, snapshots mask it (assert
 *         by type via `expect.any(SupplyError)`), never bake its text.
 *
 * .note = the value is never fabricated as null — an unreadable value is not a
 *         value, so it stays `undefined` and the schema (via safeParse) decides.
 */
export interface SupplyOmission {
  key: { path: string };
  reason: SupplyReason;
  cause: SupplyError;
}
