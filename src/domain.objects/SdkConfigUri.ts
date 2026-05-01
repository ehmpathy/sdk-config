import { DomainLiteral } from 'domain-objects';

/**
 * .what = parsed $.at() uri
 * .why = represents scheme and optional explicit path from config placeholders
 */
export interface SdkConfigUri {
  /**
   * scheme identifier, e.g., 'aws::param' or 'aws::secret'
   */
  scheme: string;

  /**
   * explicit path if provided in the uri, null for auto-derived paths
   *
   * e.g., '$.at(aws::param/shared/db/pass)' has explicitPath '/shared/db/pass'
   * e.g., '$.at(aws::param)' has explicitPath null (path will be auto-derived)
   */
  explicitPath: string | null;
}

export class SdkConfigUri
  extends DomainLiteral<SdkConfigUri>
  implements SdkConfigUri {}
