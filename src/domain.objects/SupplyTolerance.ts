import type { SupplyOmission } from './SupplyOmission';

/**
 * .what = the schema's verdict on a supply omission: 'allow' = the field accepts
 *         the left-undefined value (optional/nullish/default) so safeParse
 *         passes, 'block' = the field rejects undefined (required, or
 *         nullable-only) so it is a hard failure.
 */
export type SupplyVerdict = 'allow' | 'block';

/**
 * .what = a SupplyOmission the schema has judged — the omission's `key`+`reason`
 *         plus the schema's `verdict`. generic on the verdict so a producer can
 *         pin exactly which verdicts its set may carry (e.g. getAllBlockedSupplies
 *         returns `SupplyTolerance<'block'>[]`, so a consumer of the hard-throw's
 *         `blockers` sees, by type, that every entry is a block).
 * .why = verdict and reason are orthogonal — the schema (via safeParse) decides
 *        the verdict, the supplier's error class decides the reason. an allowed
 *        tolerance is a real member of this type (e.g. `{ verdict: 'allow',
 *        reason: 'absent' }` — an optional field that came back absent), even
 *        though today only blocks are surfaced on the throw. on a block, the
 *        reason lets an on-call engineer act — "fix the IAM grant" (denied) vs
 *        "fix a typo'd path" (absent) — with no re-run.
 */
export interface SupplyTolerance<TVerdict extends SupplyVerdict = SupplyVerdict>
  extends SupplyOmission {
  verdict: TVerdict;
}
