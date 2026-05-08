import { BadRequestError } from 'helpful-errors';
import { type SimpleSyncCache, withSimpleCache } from 'with-simple-cache';
import type { z } from 'zod';

import type { SdkConfigEnvironment } from '../domain.objects/SdkConfigEnvironment';
import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import { asFilledConfig } from './asFilledConfig';
import { asStaticConfig } from './asStaticConfig';
import { getRepoName } from './getRepoName';
import { isFailfastEnvironment } from './isFailfastEnvironment';

/**
 * .what = main factory that returns getConfig function
 * .why = provides typed config access with pluggable suppliers
 */
export const genGetConfig = <TSchema extends z.ZodType>(input: {
  schema: TSchema;
  statics: string;
  cache: SimpleSyncCache<unknown>;
  suppliers: SdkConfigSupplier[];
  environment: SdkConfigEnvironment;
  repoName?: string;
}): {
  (): Promise<z.infer<TSchema>>;
  static: () => Record<string, unknown>;
  filled: () => Promise<z.infer<TSchema>>;
} => {
  // derive repo name
  const repoName = getRepoName({ override: input.repoName });

  // create the static config loader
  const getStaticConfig = (): Record<string, unknown> => {
    return asStaticConfig({
      statics: input.statics,
      choice: input.environment.config,
    });
  };

  // create the filled config loader
  const getFilledConfigUncached = async (): Promise<z.infer<TSchema>> => {
    // load static config
    const staticConfig = getStaticConfig();

    // fill placeholders
    const filledConfig = await asFilledConfig({
      static: staticConfig,
      suppliers: input.suppliers,
      repoName,
      choice: input.environment.config,
    });

    // validate against schema
    const parseResult = input.schema.safeParse(filledConfig);

    if (!parseResult.success) {
      const errorMessage = formatZodError(parseResult.error);

      // failfast or warn based on environment
      // .note = prod/cloud warn-only is intentional per spec (vision line 54, 110, 124)
      if (isFailfastEnvironment({ environment: input.environment })) {
        throw new BadRequestError('config validation failed', {
          errors: errorMessage,
          environment: input.environment,
          hint: 'fix config to match schema',
        });
      }

      // prod/cloud: warn but continue per vision spec (line 54, 110, 124)
      // .note on `as` cast: intentional — schema validation failed but we return
      // the config anyway to avoid service crash on schema drift. the consumer
      // gets the raw filled config which may not match TSchema exactly.
      // removal path: when strict validation is required, set server='local'
      console.warn(
        '[sdk-config] validation failed, but continue in prod/cloud:',
        errorMessage,
      );
      return filledConfig as z.infer<TSchema>;
    }

    return parseResult.data;
  };

  // wrap with cache
  const getFilledConfig = withSimpleCache(getFilledConfigUncached, {
    cache: input.cache,
  });

  // create the main getConfig function with attached methods
  const getConfig = async (): Promise<z.infer<TSchema>> => {
    return getFilledConfig();
  };

  // attach static and filled methods
  getConfig.static = getStaticConfig;
  getConfig.filled = getConfig;

  return getConfig;
};

/**
 * .what = format zod validation errors into readable string
 * .why = provides clear error messages for config validation failures
 */
const formatZodError = (error: z.ZodError): string => {
  return error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
};
