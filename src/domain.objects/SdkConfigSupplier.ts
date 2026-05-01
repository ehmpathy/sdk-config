/**
 * .what = interface for credential/config value suppliers
 * .why = enables pluggable secret retrieval from different sources
 */
export interface SdkConfigSupplier {
  /**
   * scheme this supplier handles, e.g., 'aws::param' or 'aws::secret'
   */
  scheme: string;

  /**
   * fetch value for the given path
   */
  supply: (input: { path: string }) => Promise<string>;
}
