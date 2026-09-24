import { BadRequestError } from 'helpful-errors';

import type { OrgSlug } from '../domain.objects/OrgSlug';
import { isSdkConfigPlaceholder } from './isSdkConfigPlaceholder';

/**
 * .what = read the org from the static config's `organization` field
 * .why = the org leads every auto-derived path, so two orgs' repos of the same
 *        name cannot collide in one param store
 *
 * .note = ONE source. the config declares the org; a caller cannot pass one.
 *         ⛔ do NOT add an override — it mints a second source for a value that
 *         has exactly one (`rule.forbid.combinatorial-explosion`).
 *
 * .note = the charset is unchecked, on purpose — `repo` is spliced raw too. an
 *         org aws rejects surfaces as a store error that names the derived path.
 *
 * @example from the config
 * getOneOrg({ static: { organization: 'ahbode' } })
 * // → 'ahbode'
 */
export const getOneOrg = (input: {
  static: Record<string, unknown>;
}): OrgSlug => {
  // the config declares it — and it must
  const declared = input.static.organization;
  if (declared === undefined)
    throw new BadRequestError('config lacks a required `organization` field', {
      hint: 'every sdk-config consumer must declare a top-level `organization` — it becomes the first segment of every auto-derived path, so two orgs\' repos of the same name cannot collide in one param store. it is required even where every uri is explicit: the field is read on every load, so the day someone adds one bare `$.at()` it cannot silently derive an un-namespaced path. add `"organization": "your-org"` to the config. to opt a repo out of a shared namespace, declare a placeholder such as `"organization": "_"` — there is no way to derive without one',
    });

  return asOrgSegment({ value: declared });
};

/**
 * .what = assert the value is a literal non-empty string, then trim its wrapper slashes
 * .why = the org is spliced into a path, so a non-literal renders as
 *        `[object Object]` and a wrapper slash yields `//ahbode/…` — an invalid
 *        ssm name either way, which fails at the store far from the config line
 *        that caused it
 */
const asOrgSegment = (input: { value: unknown }): string => {
  const where = 'the `organization` field declared in the config';

  if (typeof input.value !== 'string')
    throw new BadRequestError('org must be a literal string', {
      source: where,
      declared: input.value,
      declaredType: typeof input.value,
      hint: `${where} must hold a literal string, such as "ahbode". a placeholder is not filled here — the org is read before any supplier runs, so it cannot itself be supplied`,
    });

  // the org is read BEFORE any supplier runs — it is what decides the path a
  // supplier reads — so a placeholder here can never be filled
  if (isSdkConfigPlaceholder({ value: input.value }))
    throw new BadRequestError('org cannot be a placeholder', {
      source: where,
      declared: input.value,
      hint: `${where} must hold a literal value, never a $.at() placeholder. the org is read before any supplier runs — it is what decides the path a supplier reads — so it cannot itself be supplied. declare the literal`,
    });

  // strip wrapper slashes, so "/ahbode/" cannot derive "//ahbode/…". the
  // `.trim()` carries weight: `'   '` is the one malformed value `typeof`
  // cannot catch, and the empty-guard below is what names it
  const trimmed = input.value.replace(/^\/+/, '').replace(/\/+$/, '').trim();

  if (!trimmed.length)
    throw new BadRequestError('org is empty', {
      source: where,
      declared: input.value,
      hint: `${where} must hold a non-empty value. to opt a repo out of a shared namespace, declare a placeholder such as "_" — an empty org would splice a blank segment and derive an unreachable path`,
    });

  return trimmed;
};
