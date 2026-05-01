import type { SdkConfigEnvironment } from '../domain.objects/SdkConfigEnvironment';

/**
 * .what = determines if environment should failfast on validation errors
 * .why = test/prep and prod-local should failfast; prod-cloud should warn only
 *
 * rationale:
 * - test/prep: always failfast to catch issues early
 * - prod/local: failfast because developer can fix immediately
 * - prod/cloud: warn only to avoid service crash on schema drift
 *
 * .note = prod/cloud warn-only is intentional per spec (vision line 54, 110, 124)
 */
export const isFailfastEnvironment = (input: {
  environment: SdkConfigEnvironment;
}): boolean => {
  // test/prep environments always failfast
  if (input.environment.access === 'test') return true;
  if (input.environment.access === 'prep') return true;

  // prod/local failfasts (developer can fix immediately)
  if (
    input.environment.access === 'prod' &&
    input.environment.server === 'local'
  )
    return true;

  // prod/cloud: warn only (service should not crash on schema drift)
  return false;
};
