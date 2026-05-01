import { DomainLiteral } from 'domain-objects';

/**
 * .what = environment configuration for sdk-config
 * .why = determines validation strictness and path derivation
 */
export interface SdkConfigEnvironment {
  /**
   * access level: test, prep, or prod
   */
  access: 'test' | 'prep' | 'prod';

  /**
   * server context: local or cloud
   */
  server: 'local' | 'cloud';
}

export class SdkConfigEnvironment
  extends DomainLiteral<SdkConfigEnvironment>
  implements SdkConfigEnvironment {}
