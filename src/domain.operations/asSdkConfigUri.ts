import { BadRequestError } from 'helpful-errors';

import { SdkConfigUri } from '../domain.objects/SdkConfigUri';

/**
 * .what = parse $.at() string to SdkConfigUri
 * .why = extract scheme and optional explicit path from config placeholders
 *
 * @example
 * asSdkConfigUri({ raw: '$.at(aws::param)' })
 * // → { scheme: 'aws::param', explicitPath: null }
 *
 * @example
 * asSdkConfigUri({ raw: '$.at(aws::param/shared/db/pass)' })
 * // → { scheme: 'aws::param', explicitPath: '/shared/db/pass' }
 */
export const asSdkConfigUri = (input: { raw: string }): SdkConfigUri => {
  // validate format
  if (!input.raw.startsWith('$.at(') || !input.raw.endsWith(')'))
    throw new BadRequestError('invalid $.at() format', {
      raw: input.raw,
      hint: 'expected format: $.at(scheme) or $.at(scheme/explicit/path)',
    });

  // extract content between $.at( and )
  const content = input.raw.slice(5, -1);
  if (!content.length)
    throw new BadRequestError('empty $.at() content', {
      raw: input.raw,
      hint: 'expected format: $.at(scheme) or $.at(scheme/explicit/path)',
    });

  // find the scheme separator (::)
  const separatorIndex = content.indexOf('::');
  if (separatorIndex === -1)
    throw new BadRequestError('invalid scheme format', {
      raw: input.raw,
      hint: 'scheme must contain :: separator, e.g., aws::param',
    });

  // check for explicit path after scheme
  const pathStart = content.indexOf('/', separatorIndex);
  if (pathStart === -1) {
    // no explicit path
    return new SdkConfigUri({
      scheme: content,
      explicitPath: null,
    });
  }

  // has explicit path
  const scheme = content.slice(0, pathStart);
  const explicitPath = content.slice(pathStart);

  return new SdkConfigUri({
    scheme,
    explicitPath,
  });
};
