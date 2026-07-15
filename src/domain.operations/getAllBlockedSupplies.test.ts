import { given, then, when } from 'test-fns';
import { z } from 'zod';

import {
  SupplyAbsentError,
  SupplyDeniedError,
} from '../domain.objects/SupplyError';
import { getAllBlockedSupplies } from './getAllBlockedSupplies';

describe('getAllBlockedSupplies', () => {
  // helper: safeParse a filled config and hand its ZodError to the transformer
  const getError = (schema: z.ZodType, filled: unknown): z.ZodError => {
    const result = schema.safeParse(filled);
    if (result.success)
      throw new Error('expected a parse failure for the probe');
    return result.error;
  };

  // deterministic cause fixtures — the SupplyError fill tolerated for each path.
  // reused in both the omission input and the expected tolerance output so the
  // spread preserves the same reference and toEqual still matches exactly.
  const deniedApiKey = new SupplyDeniedError('access denied', {
    path: 'api.key',
  });
  const absentApiKey = new SupplyAbsentError('not found', { path: 'api.key' });
  const deniedDbPassword = new SupplyDeniedError('access denied', {
    path: 'database.password',
  });
  const deniedApi = new SupplyDeniedError('access denied', { path: 'api' });

  given('[case1] a denied leaf that caused the validation failure', () => {
    const schema = z.object({ api: z.object({ key: z.string() }) });
    const error = getError(schema, { api: { key: undefined } });

    when('[t0] the denied key.path matches the failure path', () => {
      then('it is returned, verdict block, reason carried', () => {
        expect(
          getAllBlockedSupplies({
            omissions: [
              {
                key: { path: 'api.key' },
                reason: 'denied',
                cause: deniedApiKey,
              },
            ],
            error,
          }),
        ).toEqual([
          {
            key: { path: 'api.key' },
            reason: 'denied',
            cause: deniedApiKey,
            verdict: 'block',
          },
        ]);
      });
    });
  });

  given('[case2] a denied leaf that did NOT cause the failure', () => {
    // the failure is on database.host; the denied supply is an unrelated
    // (tolerated) optional field, so it is not a block.
    const schema = z.object({
      database: z.object({ host: z.string() }),
      api: z.object({ key: z.string().optional() }),
    });
    const error = getError(schema, {
      database: { host: undefined },
      api: { key: undefined },
    });

    when('[t0] the denied key.path does not intersect any failure path', () => {
      then('it is not returned (not a block — schema drift elsewhere)', () => {
        expect(
          getAllBlockedSupplies({
            omissions: [
              {
                key: { path: 'api.key' },
                reason: 'absent',
                cause: absentApiKey,
              },
            ],
            error,
          }),
        ).toEqual([]);
      });
    });
  });

  given('[case3] two denied leaves that both caused failures', () => {
    const schema = z.object({
      database: z.object({ password: z.string() }),
      api: z.object({ key: z.string() }),
    });
    const error = getError(schema, {
      database: { password: undefined },
      api: { key: undefined },
    });

    when('[t0] both denied key.paths match failure paths', () => {
      then('both are returned as blocks with their reasons', () => {
        expect(
          getAllBlockedSupplies({
            omissions: [
              {
                key: { path: 'database.password' },
                reason: 'denied',
                cause: deniedDbPassword,
              },
              {
                key: { path: 'api.key' },
                reason: 'absent',
                cause: absentApiKey,
              },
            ],
            error,
          }),
        ).toEqual([
          {
            key: { path: 'database.password' },
            reason: 'denied',
            cause: deniedDbPassword,
            verdict: 'block',
          },
          {
            key: { path: 'api.key' },
            reason: 'absent',
            cause: absentApiKey,
            verdict: 'block',
          },
        ]);
      });
    });
  });

  given('[case4] a denied ancestor whose required child failed', () => {
    // the denied key.path is the ancestor `api` (whole node unreadable); the
    // failure surfaces at the deeper required child `api.key`. the ancestor is
    // still the cause, so it blocks (prefix match in either direction).
    const schema = z.object({ api: z.object({ key: z.string() }) });
    const error = getError(schema, { api: { key: undefined } });

    when('[t0] the denied key.path is a prefix of the failure path', () => {
      then('it is returned as a block', () => {
        expect(
          getAllBlockedSupplies({
            omissions: [
              { key: { path: 'api' }, reason: 'denied', cause: deniedApi },
            ],
            error,
          }),
        ).toEqual([
          {
            key: { path: 'api' },
            reason: 'denied',
            cause: deniedApi,
            verdict: 'block',
          },
        ]);
      });
    });
  });
});
