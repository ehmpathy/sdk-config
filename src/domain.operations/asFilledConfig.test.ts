import { BadRequestError, getError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';

import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import { SupplyDeniedError } from '../domain.objects/SupplyError';
import { asFilledConfig } from './asFilledConfig';

describe('asFilledConfig', () => {
  // .note = FAKES, never mocks — the shape `rule.forbid.unit.remote-boundaries`
  //         mandates at unit grade. a supplier is injected by contract, so no
  //         remote boundary is crossed and no jest.fn is needed. each echoes the
  //         path it was handed, which is what makes the derived ADDRESS
  //         assertable in a pure test.
  const fakeParamSupplier: SdkConfigSupplier = {
    scheme: 'aws::param',
    supply: async ({ path }) => `param-value-for-${path}`,
  };

  const fakeSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => `secret-value-for-${path}`,
  };

  given('[case1] single placeholder', () => {
    const staticConfig = {
      database: {
        host: 'localhost',
        password: '$.at(aws::param)',
      },
    };

    when('[t0] filled', () => {
      then('replaces placeholder with supplied value', async () => {
        const result = await asFilledConfig({
          static: staticConfig,
          suppliers: [fakeParamSupplier],
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
        });
        expect(result.filled).toMatchObject({
          database: {
            host: 'localhost',
            password: 'param-value-for-/ahbode/svc-x/prod/database.password',
          },
        });
      });
    });
  });

  given('[case2] multiple placeholders', () => {
    const staticConfig = {
      database: {
        password: '$.at(aws::param)',
      },
      api: {
        key: '$.at(aws::secret)',
      },
    };

    when('[t0] filled', () => {
      then('replaces all placeholders', async () => {
        const result = await asFilledConfig({
          static: staticConfig,
          suppliers: [fakeParamSupplier, fakeSecretSupplier],
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
        });
        expect(result.filled).toMatchObject({
          database: {
            password: 'param-value-for-/ahbode/svc-x/prod/database.password',
          },
          api: {
            key: 'secret-value-for-/ahbode/svc-x/prod/api.key',
          },
        });
      });
    });
  });

  given('[case3] nested placeholders', () => {
    const staticConfig = {
      services: {
        stripe: {
          api: {
            secretKey: '$.at(aws::secret)',
          },
        },
      },
    };

    when('[t0] filled', () => {
      then('derives correct nested keyPath', async () => {
        const result = await asFilledConfig({
          static: staticConfig,
          suppliers: [fakeSecretSupplier],
          org: 'ahbode',
          repo: 'svc-api',
          choice: 'test',
        });
        expect(result.filled).toMatchObject({
          services: {
            stripe: {
              api: {
                secretKey:
                  'secret-value-for-/ahbode/svc-api/test/services.stripe.api.secretKey',
              },
            },
          },
        });
      });
    });
  });

  given('[case4] unknown scheme', () => {
    const staticConfig = {
      value: '$.at(unknown::scheme)',
    };

    when('[t0] filled', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asFilledConfig({
            static: staticConfig,
            suppliers: [fakeParamSupplier],
            org: 'ahbode',
            repo: 'svc-x',
            choice: 'prod',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('unknown scheme');
      });
    });
  });

  given('[case5] no placeholders (passthrough)', () => {
    const staticConfig = {
      database: {
        host: 'localhost',
        port: 5432,
      },
      features: {
        enabled: true,
        count: 42,
      },
    };

    when('[t0] filled', () => {
      then('returns config unchanged', async () => {
        const result = await asFilledConfig({
          static: staticConfig,
          suppliers: [fakeParamSupplier],
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
        });
        expect(result.filled).toEqual(staticConfig);
      });
    });
  });

  given('[case7] tolerable supply error', () => {
    const deniedParamSupplier: SdkConfigSupplier = {
      scheme: 'aws::param',
      supply: async ({ path }) => {
        throw new SupplyDeniedError('access denied', { path });
      },
    };

    const staticConfig = {
      database: {
        host: 'localhost',
        password: '$.at(aws::param)',
      },
    };

    when('[t0] filled', () => {
      const scene = useBeforeAll(async () =>
        asFilledConfig({
          static: staticConfig,
          suppliers: [deniedParamSupplier],
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
        }),
      );

      then('substitutes undefined for the denied value', () => {
        expect(scene.filled.database).toEqual({
          host: 'localhost',
          password: undefined,
        });
      });

      then('records the omission key.path with reason denied', () => {
        expect(scene.omissions).toEqual([
          {
            key: { path: 'database.password' },
            reason: 'denied',
            cause: expect.any(SupplyDeniedError),
          },
        ]);
      });
    });
  });

  given('[case8] non-tolerable supply error propagates', () => {
    const brokenParamSupplier: SdkConfigSupplier = {
      scheme: 'aws::param',
      supply: async () => {
        throw new Error('network timeout');
      },
    };

    const staticConfig = {
      database: { password: '$.at(aws::param)' },
    };

    when('[t0] filled', () => {
      then('the error is not masked', async () => {
        const error = await getError(async () =>
          asFilledConfig({
            static: staticConfig,
            suppliers: [brokenParamSupplier],
            org: 'ahbode',
            repo: 'svc-x',
            choice: 'prod',
          }),
        );
        expect(error.message).toContain('network timeout');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case9] array with one denied element (data-loss regression)', () => {
    // this locks the bug class that motivated the no-walk teardown: a denied
    // element must leave its own field undefined IN PLACE — never drop the
    // element, never wipe the readable peer element.
    const deniedParamSupplier: SdkConfigSupplier = {
      scheme: 'aws::param',
      supply: async ({ path }) => {
        // deny only the first element's secret; the literal peer is untouched
        if (path.endsWith('items.0.secret'))
          throw new SupplyDeniedError('access denied', { path });
        return `param-value-for-${path}`;
      },
    };

    const staticConfig = {
      items: [{ secret: '$.at(aws::param)' }, { secret: 'readable' }],
    };

    when('[t0] filled', () => {
      const scene = useBeforeAll(async () =>
        asFilledConfig({
          static: staticConfig,
          suppliers: [deniedParamSupplier],
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
        }),
      );

      then('keeps both elements; denied field is undefined in place', () => {
        expect(scene.filled.items).toEqual([
          { secret: undefined },
          { secret: 'readable' },
        ]);
      });

      then('records only the denied element key.path', () => {
        expect(scene.omissions).toEqual([
          {
            key: { path: 'items.0.secret' },
            reason: 'denied',
            cause: expect.any(SupplyDeniedError),
          },
        ]);
      });

      then(
        'and the ARRAY branch threaded the org into the derived path',
        () => {
          // 🔴 the only clamp on the array recursion that can SEE the org.
          //    `asFilledConfig` re-passes `org` at each descent, and the array
          //    branch is a separate call site from the object branch — so a build
          //    that dropped it there alone would derive `/svc-x/prod/…` here and
          //    stay green on every other assertion in this case: the supplier
          //    keys its deny on `.endsWith('items.0.secret')`, which is
          //    org-agnostic, and both assertions above read only the SHAPE.
          //
          // .note = the address is read off the SupplyDeniedError the supplier
          //         threw, so no re-derive happens in the test. we map the
          //         whole array rather than index into it, so the shape is
          //         asserted alongside the address — exactly one omission,
          //         and its cause carries the org-scoped path.
          expect(
            scene.omissions.map((omission) => omission.cause.message),
          ).toEqual([
            expect.stringContaining('/ahbode/svc-x/prod/items.0.secret'),
          ]);
        },
      );
    });
  });

  given('[case6] explicit path in placeholder', () => {
    const staticConfig = {
      shared: {
        dbPassword: '$.at(aws::param/shared/database/password)',
      },
    };

    when('[t0] filled', () => {
      then('uses explicit path instead of auto-derived', async () => {
        const result = await asFilledConfig({
          static: staticConfig,
          suppliers: [fakeParamSupplier],
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
        });
        expect(result.filled).toMatchObject({
          shared: {
            dbPassword: 'param-value-for-/shared/database/password',
          },
        });
      });
    });
  });
});
