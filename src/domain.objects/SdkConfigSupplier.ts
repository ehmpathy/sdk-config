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
   * fetch value for the given path.
   *
   * .tolerance = to opt into optional-key tolerance, throw a `SupplyAbsentError`
   *   (value not found) or `SupplyDeniedError` (authz-denied, only after retries
   *   so a transient denial is never masked) — both exported from the package
   *   root. `genGetConfig` catches these, leaves the value `undefined` in place
   *   (never fabricated as null), and lets the schema decide via safeParse: a
   *   field that accepts undefined (optional/nullish/default) tolerates the miss;
   *   a nullable-only or required field rejects undefined and is a hard failure.
   *   any other error propagates unchanged.
   */
  supply: (input: { path: string }) => Promise<string>;
}
