import { BadRequestError } from 'helpful-errors';

import type { SdkConfigUri } from '../domain.objects/SdkConfigUri';

/**
 * .what = derive full path from uri + context
 * .why = auto-derive paths for convenience, pass through explicit paths
 *
 * @example auto-derive
 * asSdkConfigPath({
 *   uri: { scheme: 'aws::param', explicitPath: null },
 *   repoName: 'svc-x',
 *   access: 'prod',
 *   keyPath: 'database.password',
 * })
 * // → '/svc-x/prod/database.password'
 *
 * @example explicit path
 * asSdkConfigPath({
 *   uri: { scheme: 'aws::param', explicitPath: '/shared/db/pass' },
 *   repoName: 'svc-x',
 *   access: 'prod',
 *   keyPath: 'database.password',
 * })
 * // → '/shared/db/pass'
 */
export const asSdkConfigPath = (input: {
  uri: SdkConfigUri;
  repoName: string;
  access: string;
  keyPath: string;
}): string => {
  // if explicit path, return it
  if (input.uri.explicitPath !== null) return input.uri.explicitPath;

  // validate keyPath is not empty
  if (!input.keyPath.length)
    throw new BadRequestError('empty keyPath', {
      uri: input.uri,
      repoName: input.repoName,
      access: input.access,
      hint: 'keyPath is required for auto-derived paths',
    });

  // auto-derive: /{repoName}/{access}/{keyPath}
  return `/${input.repoName}/${input.access}/${input.keyPath}`;
};
