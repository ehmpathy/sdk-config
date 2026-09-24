/**
 * .what = the org segment of a derived config path — a github org or account slug
 * .why = one aws account hosts two orgs' repos in one param store, so the org
 *        leads every derived path and same-named repos cannot collide
 *
 * .note = `'_'` opts out into a SHARED pool, not a private one — two opted-out
 *         `svc-x` still collide at `/_/svc-x/…`. declare a real org for a
 *         namespace of your own.
 *
 * @example 'ehmpathy'
 * @example '_'
 */
export type OrgSlug = string;
