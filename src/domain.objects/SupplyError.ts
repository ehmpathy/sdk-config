import { BadRequestError } from 'helpful-errors';

/**
 * .what = base class for a supplier error that fill MAY tolerate
 * .why = lets asFilledConfig classify tolerable-vs-fatal by a stable type,
 *        rather than a rewrapped message or a lost AWS error class
 *
 * .note = extends BadRequestError (the class the suppliers threw for not-found
 *         before this taxonomy) so a consumer who catches BadRequestError from a
 *         direct supplier.supply() call still catches these — the taxonomy is
 *         additive, not a contract break.
 *
 * .note = a supply error is "tolerable" only in the sense that fill will
 *         substitute undefined for it; whether that is acceptable is decided
 *         downstream by safeParse (optional/nullish accept undefined; required
 *         and nullable-only reject it, which surfaces as a hard failure).
 *
 * .note = abstract on purpose — fill classifies the reason as
 *         `denied` (SupplyDeniedError) vs `absent` (all else), so a
 *         directly-thrown base SupplyError would silently tag `absent`. only the
 *         two concrete subclasses carry a correct, unambiguous reason.
 */
export abstract class SupplyError extends BadRequestError<{
  path: string;
  hint?: string;
  cause?: Error;
}> {}

/**
 * .what = the requested value is absent at the source (e.g., ParameterNotFound)
 * .why = an absent value is tolerable at fill; the schema decides if that is ok
 */
export class SupplyAbsentError extends SupplyError {}

/**
 * .what = the reader is authz-denied for this path, and the denial persisted
 *         across retries (e.g., AccessDeniedException that did not clear)
 * .why = a persistent denial is tolerable at fill; the schema decides if that
 *        is ok. a transient denial is retried by the supplier and never becomes
 *        this error, so this never masks IAM eventual-consistency.
 */
export class SupplyDeniedError extends SupplyError {}
