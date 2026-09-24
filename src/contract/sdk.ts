/**
 * .what = sdk-config — the package entrypoint, and its ONLY public surface
 * .why = typed config with pluggable credential suppliers
 *
 * .note = under `contract/`, where public surfaces belong
 *         (`rule.require.directional-deps`), and named `sdk.ts` over
 *         `index.ts` (`rule.forbid.index-ts`). `package.json` points `main` and
 *         `types` straight here.
 *
 * ⛔ do NOT add a `src/index.ts` that forwards from this file. two export lists
 *    agree only by hand, and a hand fails silently — the consumer is the first
 *    to find out (`rule.forbid.barrel-exports`).
 */

// domain objects
// the two path-segment slugs, so a consumer can name what it holds over a bare
// `string`: `/{OrgSlug}/{RepoSlug}/{EnvironmentConfigSlug}/{keyPath}`
export type { OrgSlug } from '../domain.objects/OrgSlug';
export type { RepoSlug } from '../domain.objects/RepoSlug';
export { SdkConfigEnvironment } from '../domain.objects/SdkConfigEnvironment';
export type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
// tolerable supply errors — a custom supplier throws these so fill can tolerate
// an absent/denied value when the schema marks the field optional/nullable
export {
  SupplyAbsentError,
  SupplyDeniedError,
  SupplyError,
} from '../domain.objects/SupplyError';
// diagnostic shapes for the optional-key feature. a required-denied throw carries
// `blockers: SupplyTolerance<'block'>[]` — exported so a consumer can branch on a
// block's `reason` ('denied' vs 'absent') and read `key.path` with a type. the
// omission (verdict-free key+reason) and the verdict enum are exported too so a
// custom-supplier author can name the full vocabulary.
export type {
  SupplyOmission,
  SupplyReason,
} from '../domain.objects/SupplyOmission';
export type {
  SupplyTolerance,
  SupplyVerdict,
} from '../domain.objects/SupplyTolerance';
// main factory
export { genGetConfig } from '../domain.operations/genGetConfig';
// supplier factories
export { genSdkConfigSupplierAwsParameterStore } from '../domain.operations/genSdkConfigSupplierAwsParameterStore';
export { genSdkConfigSupplierAwsSecretsManager } from '../domain.operations/genSdkConfigSupplierAwsSecretsManager';
