/**
 * .what = sdk-config
 * .why = typed config with pluggable credential suppliers
 */

export type {
  SdkConfigSupplier,
  SupplyOmission,
  SupplyReason,
  SupplyTolerance,
  SupplyVerdict,
} from './contract/sdk';
export {
  // main factory
  genGetConfig,
  // supplier factories
  genSdkConfigSupplierAwsParameterStore,
  genSdkConfigSupplierAwsSecretsManager,
  // domain objects
  SdkConfigEnvironment,
  // tolerable supply errors (for custom suppliers)
  SupplyAbsentError,
  SupplyDeniedError,
  SupplyError,
} from './contract/sdk';
