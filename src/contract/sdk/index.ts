/**
 * .what = sdk-config public api
 * .why = typed config with pluggable credential suppliers
 */

// domain objects
export { SdkConfigEnvironment } from '../../domain.objects/SdkConfigEnvironment';
export type { SdkConfigSupplier } from '../../domain.objects/SdkConfigSupplier';
// main factory
export { genGetConfig } from '../../domain.operations/genGetConfig';
// supplier factories
export { genSdkConfigSupplierAwsParameterStore } from '../../domain.operations/genSdkConfigSupplierAwsParameterStore';
export { genSdkConfigSupplierAwsSecretsManager } from '../../domain.operations/genSdkConfigSupplierAwsSecretsManager';
