/**
 * .what = sdk-config
 * .why = typed config with pluggable credential suppliers
 */

export type { SdkConfigSupplier } from './contract/sdk';
export {
  // main factory
  genGetConfig,
  // supplier factories
  genSdkConfigSupplierAwsParameterStore,
  genSdkConfigSupplierAwsSecretsManager,
  // domain objects
  SdkConfigEnvironment,
} from './contract/sdk';
