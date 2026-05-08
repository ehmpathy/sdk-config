import { DomainLiteral } from 'domain-objects';
import type {
  EnvironmentConfigSlug,
  EnvironmentServerTier,
} from 'sdk-environment';

/**
 * .what = environment configuration for sdk-config
 * .why = determines validation strictness and path derivation
 */
export interface SdkConfigEnvironment {
  /**
   * which config environment to load (e.g., 'test', 'prep', 'prod')
   */
  config: EnvironmentConfigSlug;

  /**
   * where this process executes (e.g., 'local@unix', 'cloud@aws.lambda')
   */
  server: EnvironmentServerTier;
}

export class SdkConfigEnvironment
  extends DomainLiteral<SdkConfigEnvironment>
  implements SdkConfigEnvironment {}
