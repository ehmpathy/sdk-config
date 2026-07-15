import { BadRequestError } from 'helpful-errors';
import { type SimpleSyncCache, withSimpleCache } from 'with-simple-cache';
import type { z } from 'zod';

import type { SdkConfigEnvironment } from '../domain.objects/SdkConfigEnvironment';
import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import type { SupplyTolerance } from '../domain.objects/SupplyTolerance';
import { asFilledConfig } from './asFilledConfig';
import { asStaticConfig } from './asStaticConfig';
import { getAllBlockedSupplies } from './getAllBlockedSupplies';
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

    // fill placeholders; on a tolerable error (absent/denied) the value is left
    // undefined in place — never fabricated — and the miss (key + reason)
    // recorded. we did not observe a value, so undefined (unknown) is the honest
    // fill; we do NOT substitute null (a null is a value we never saw).
    const { filled, omissions } = await asFilledConfig({
      static: staticConfig,
      suppliers: input.suppliers,
      repoName,
      choice: input.environment.config,
    });

    // the schema is the SOLE arbiter — safeParse the filled config directly, no
    // pre-walk. a field that accepts undefined (.optional()/.nullish()/.default())
    // tolerates its unreadable value; every other shape (required, nullable-only)
    // rejects undefined and fails here, which is correct: it was required-present.
    const parseResult = input.schema.safeParse(filled);
    if (parseResult.success) return parseResult.data;

    const errorMessage = formatZodError(parseResult.error);

    // of the fields we could not read, which ones caused a validation failure?
    // those are required-present values that are genuinely unreadable — a hard
    // failure, ALWAYS, independent of environment. (a readable-but-wrong value is
    // schema drift, handled below.) each block carries why (denied vs absent) so
    // on-call can act without a re-run against AWS.
    const blockers: SupplyTolerance<'block'>[] = getAllBlockedSupplies({
      omissions,
      error: parseResult.error,
    });
    if (blockers.length > 0) {
      // each blocker carries its `cause` — the exact SupplyError fill tolerated,
      // so on-call sees the config `key`, why it missed (`reason`), the
      // `verdict`, AND the supplier error itself (its source path, hint, and any
      // nested aws cause) without a re-run.
      throw new BadRequestError(
        'config requires values that could not be read',
        {
          blockers,
          errors: errorMessage,
          environment: input.environment,
          hint: "if a key was 'denied', the env was detected to explicitly lack privs to read it — grant it access or mark the field .optional()/.nullish() to tolerate the miss. if a key was 'absent', the source had no value at that path — decide whether to set it or mark the field .optional()/.nullish(). each blocker's cause carries the supplier error behind the miss",
        },
      );
    }

    // otherwise this is schema drift (present-but-wrong): failfast or warn by env
    // .note = prod/cloud warn-only is intentional per the vision's "validation"
    //         env-behavior table (schema drift warns in prod/cloud, never crashes)
    if (isFailfastEnvironment({ environment: input.environment })) {
      throw new BadRequestError('config validation failed', {
        errors: errorMessage,
        environment: input.environment,
        hint: 'fix config to match schema',
      });
    }

    // prod/cloud: warn but continue on schema drift per vision spec
    // .note on `as` cast: intentional — this is the degradation boundary. schema
    // validation failed, but we hand back the best-effort config to avoid a
    // service crash on drift. the value genuinely may not conform to TSchema, so
    // no runtime check could honestly produce that type here — the cast names the
    // unsound-but-deliberate assertion openly rather than hide it behind a no-op
    // parse. removal path: when strict validation is required, set server='local'.
    console.warn(
      '[sdk-config] validation failed, but continue in prod/cloud:',
      errorMessage,
    );
    return filled as z.infer<TSchema>;
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
