/**
 * .what = the repo segment of a derived config path — a repository slug
 * .why = the second segment of every auto-derived path. `getOneRepo` takes the
 *        config's `repository`, else `package.json`'s `name`
 *
 * @example 'svc-notifications'
 * @example 'sdk-config'
 */
export type RepoSlug = string;
