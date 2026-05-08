import { BadRequestError } from 'helpful-errors';
import type { EnvironmentConfigSlug } from 'sdk-environment';

import type { SdkConfigUri } from '../domain.objects/SdkConfigUri';

/**
 * .what = derive full path from uri + context
 * .why = auto-derive paths for convenience, pass through explicit paths
 *
 * @example auto-derive
 * asSdkConfigPath({
 *   uri: { scheme: 'aws::param', explicitPath: null },
 *   repoName: 'svc-x',
 *   choice: 'prod',
 *   keyPath: 'database.password',
 * })
 * // → '/svc-x/prod/database.password'
 *
 * @example explicit path
 * asSdkConfigPath({
 *   uri: { scheme: 'aws::param', explicitPath: '/shared/db/pass' },
 *   repoName: 'svc-x',
 *   choice: 'prod',
 *   keyPath: 'database.password',
 * })
 * // → '/shared/db/pass'
 */
export const asSdkConfigPath = (input: {
  uri: SdkConfigUri;
  repoName: string;
  choice: EnvironmentConfigSlug;
  keyPath: string;
}): string => {
  // if explicit path, return it
  if (input.uri.explicitPath !== null) return input.uri.explicitPath;

  // validate keyPath is not empty
  if (!input.keyPath.length)
    throw new BadRequestError('empty keyPath', {
      uri: input.uri,
      repoName: input.repoName,
      choice: input.choice,
      hint: 'keyPath is required for auto-derived paths',
    });

  // auto-derive: /{repoName}/{choice}/{keyPath}
  return `/${input.repoName}/${input.choice}/${input.keyPath}`;
};
