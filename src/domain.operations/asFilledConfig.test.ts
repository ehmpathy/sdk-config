import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import { asFilledConfig } from './asFilledConfig';

describe('asFilledConfig', () => {
  const mockParamSupplier: SdkConfigSupplier = {
    scheme: 'aws::param',
    supply: async ({ path }) => `param-value-for-${path}`,
  };

  const mockSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => `secret-value-for-${path}`,
  };

  given('[case1] single placeholder', () => {
    const config = {
      database: {
        host: 'localhost',
        password: '$.at(aws::param)',
      },
    };

    when('[t0] filled', () => {
      then('replaces placeholder with supplied value', async () => {
        const result = await asFilledConfig({
          config,
          suppliers: [mockParamSupplier],
          repoName: 'svc-x',
          access: 'prod',
        });
        expect(result).toMatchObject({
          database: {
            host: 'localhost',
            password: 'param-value-for-/svc-x/prod/database.password',
          },
        });
      });
    });
  });

  given('[case2] multiple placeholders', () => {
    const config = {
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
          config,
          suppliers: [mockParamSupplier, mockSecretSupplier],
          repoName: 'svc-x',
          access: 'prod',
        });
        expect(result).toMatchObject({
          database: {
            password: 'param-value-for-/svc-x/prod/database.password',
          },
          api: {
            key: 'secret-value-for-/svc-x/prod/api.key',
          },
        });
      });
    });
  });

  given('[case3] nested placeholders', () => {
    const config = {
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
          config,
          suppliers: [mockSecretSupplier],
          repoName: 'svc-api',
          access: 'test',
        });
        expect(result).toMatchObject({
          services: {
            stripe: {
              api: {
                secretKey:
                  'secret-value-for-/svc-api/test/services.stripe.api.secretKey',
              },
            },
          },
        });
      });
    });
  });

  given('[case4] unknown scheme', () => {
    const config = {
      value: '$.at(unknown::scheme)',
    };

    when('[t0] filled', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asFilledConfig({
            config,
            suppliers: [mockParamSupplier],
            repoName: 'svc-x',
            access: 'prod',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('unknown scheme');
      });
    });
  });

  given('[case5] no placeholders (passthrough)', () => {
    const config = {
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
          config,
          suppliers: [mockParamSupplier],
          repoName: 'svc-x',
          access: 'prod',
        });
        expect(result).toEqual(config);
      });
    });
  });

  given('[case6] explicit path in placeholder', () => {
    const config = {
      shared: {
        dbPassword: '$.at(aws::param/shared/database/password)',
      },
    };

    when('[t0] filled', () => {
      then('uses explicit path instead of auto-derived', async () => {
        const result = await asFilledConfig({
          config,
          suppliers: [mockParamSupplier],
          repoName: 'svc-x',
          access: 'prod',
        });
        expect(result).toMatchObject({
          shared: {
            dbPassword: 'param-value-for-/shared/database/password',
          },
        });
      });
    });
  });
});
