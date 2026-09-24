import { BadRequestError } from 'helpful-errors';
import type { EnvironmentConfigSlug } from 'sdk-environment';

import type { OrgSlug } from '../domain.objects/OrgSlug';
import type { RepoSlug } from '../domain.objects/RepoSlug';
import type { SdkConfigUri } from '../domain.objects/SdkConfigUri';

/**
 * .what = derive full path from uri + context
 * .why = auto-derive paths for convenience, pass through explicit paths
 *
 * .note = the org is non-nullable on arrival — `getOneOrg` throws over returns
 *         absent — so there is ONE template here and no branch. an
 *         un-namespaced derive is unreachable, over discouraged.
 *
 * .note = the derive never reads `uri.scheme`. an org namespace is a property
 *         of the repo, never of the store it reads from.
 *
 * @example auto-derive
 * asSdkConfigPath({
 *   uri: { scheme: 'aws::param', explicitPath: null },
 *   org: 'ahbode',
 *   repo: 'svc-x',
 *   choice: 'prod',
 *   keyPath: 'database.password',
 * })
 * // → '/ahbode/svc-x/prod/database.password'
 *
 * @example explicit path
 * asSdkConfigPath({
 *   uri: { scheme: 'aws::param', explicitPath: '/shared/db/pass' },
 *   org: 'ahbode',
 *   repo: 'svc-x',
 *   choice: 'prod',
 *   keyPath: 'database.password',
 * })
 * // → '/shared/db/pass'   ← the org is never spliced into an explicit path
 */
export const asSdkConfigPath = (input: {
  uri: SdkConfigUri;
  org: OrgSlug;
  repo: RepoSlug;
  choice: EnvironmentConfigSlug;
  keyPath: string;
}): string => {
  // if explicit path, return it
  if (input.uri.explicitPath !== null) return input.uri.explicitPath;

  // validate keyPath is not empty
  if (!input.keyPath.length)
    throw new BadRequestError('empty keyPath', {
      uri: input.uri,
      org: input.org,
      repo: input.repo,
      choice: input.choice,
      hint: 'keyPath is required for auto-derived paths',
    });

  // auto-derive: /{org}/{repo}/{choice}/{keyPath}
  return `/${input.org}/${input.repo}/${input.choice}/${input.keyPath}`;
};
