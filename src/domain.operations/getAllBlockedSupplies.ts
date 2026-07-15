import type { z } from 'zod';

import type { SupplyOmission } from '../domain.objects/SupplyOmission';
import type { SupplyTolerance } from '../domain.objects/SupplyTolerance';

/**
 * .what = of the config supplies that were omitted (each a `SupplyOmission`),
 *         return the ones that CAUSED a schema-validation failure — each judged
 *         verdict:'block'. an omission blocks when its `key.path` coincides with a
 *         validation issue path (the field was required-present, so its
 *         unreadable-undefined value is rejected by the schema).
 * .why = the schema is the sole arbiter: safeParse decides pass/fail, this only
 *        attributes a failure back to the specific omission that caused it (vs
 *        unrelated schema drift on a readable-but-wrong value). that lets
 *        genGetConfig tell "required secret unreadable" (hard-throw, name the
 *        cause) apart from "present value wrong shape" (env-gated drift). the
 *        `SupplyTolerance<'block'>` return pins, by type, that every entry blocks.
 */
export const getAllBlockedSupplies = (input: {
  omissions: SupplyOmission[];
  error: z.ZodError;
}): SupplyTolerance<'block'>[] => {
  // the dot-joined path of every validation issue
  const issuePaths = input.error.issues.map((issue) => issue.path.join('.'));

  // an omission blocks when its key.path coincides with an issue path: exactly
  // equal, or one is an ancestor of the other (a denied leaf whose required
  // parent failed, or a denied parent whose required leaf failed)
  return input.omissions
    .filter((omission) =>
      issuePaths.some(
        (issuePath) =>
          issuePath === omission.key.path ||
          issuePath.startsWith(`${omission.key.path}.`) ||
          omission.key.path.startsWith(`${issuePath}.`),
      ),
    )
    .map((omission) => ({ ...omission, verdict: 'block' as const }));
};
