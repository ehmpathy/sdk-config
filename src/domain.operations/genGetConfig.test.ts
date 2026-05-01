import { BadRequestError, getError } from 'helpful-errors';
import { join } from 'path';
import { given, then, useBeforeAll, when } from 'test-fns';
import { z } from 'zod';

import { SdkConfigEnvironment } from '../domain.objects/SdkConfigEnvironment';
import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import { genGetConfig } from './genGetConfig';

const TEST_CONFIG_DIR = join(__dirname, '../__test_assets__/config');

describe('genGetConfig', () => {
  const mockParamSupplier: SdkConfigSupplier = {
    scheme: 'aws::param',
    supply: async ({ path }) => `param:${path}`,
  };

  const mockSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => `secret:${path}`,
  };

  const testSchema = z.object({
    database: z.object({
      host: z.string(),
      port: z.number(),
      password: z.string(),
    }),
    api: z.object({
      key: z.string(),
      url: z.string(),
    }),
  });

  const testEnv = new SdkConfigEnvironment({
    access: 'test',
    server: 'local',
  });

  const createCache = () => {
    const store = new Map<string, unknown>();
    return {
      get: <T>(key: string) => store.get(key) as T | undefined,
      set: <T>(key: string, val: T) => {
        store.set(key, val);
      },
    };
  };

  given('[case1] typed config with secrets', () => {
    when('[t0] getConfig() is called', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, mockSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      const result = useBeforeAll(async () => getConfig());

      then('returns typed config with filled secrets', () => {
        expect(result.database.password).toEqual(
          'param:/test-svc/test/database.password',
        );
        expect(result.api.key).toEqual('secret:/shared/api/key');
      });

      then('config matches snapshot', () => {
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case2] static config sync', () => {
    when('[t0] getConfig.static() is called', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      then('returns raw config with placeholders', () => {
        const staticConfig = getConfig.static();
        expect(staticConfig.database).toMatchObject({
          host: 'localhost',
          password: '$.at(aws::param)',
        });
      });

      then('static config matches snapshot', () => {
        const staticConfig = getConfig.static();
        expect(staticConfig).toMatchSnapshot();
      });
    });
  });

  given('[case3] validation by environment - test env fails fast', () => {
    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // field that does not exist in config
      }),
    });

    when('[t0] schema mismatch in test env', () => {
      const getConfig = genGetConfig({
        schema: badSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, mockSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      then('throws BadRequestError', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('config validation failed');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case4] auto-derive paths', () => {
    when('[t0] placeholder without explicit path', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, mockSecretSupplier],
        environment: testEnv,
        repoName: 'my-service',
      });

      const result = useBeforeAll(async () => getConfig());

      then('path is auto-derived from repo + access + keyPath', () => {
        expect(result.database.password).toEqual(
          'param:/my-service/test/database.password',
        );
      });

      then('config matches snapshot', () => {
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case5] explicit paths', () => {
    when('[t0] placeholder with explicit path', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, mockSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      const result = useBeforeAll(async () => getConfig());

      then('explicit path is used directly', () => {
        // test.yml has: api.key: '$.at(aws::secret/shared/api/key)'
        expect(result.api.key).toEqual('secret:/shared/api/key');
      });

      then('config matches snapshot', () => {
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case6] unknown supplier', () => {
    when('[t0] config uses scheme without registered supplier', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [], // no suppliers registered
        environment: testEnv,
        repoName: 'test-svc',
      });

      then('throws BadRequestError', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('unknown scheme');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case7] cache behavior', () => {
    let supplierCallCount = 0;
    const countedSupplier: SdkConfigSupplier = {
      scheme: 'aws::param',
      supply: async ({ path }) => {
        supplierCallCount++;
        return `param:${path}`;
      },
    };

    const countedSecretSupplier: SdkConfigSupplier = {
      scheme: 'aws::secret',
      supply: async ({ path }) => {
        supplierCallCount++;
        return `secret:${path}`;
      },
    };

    when('[t0] getConfig() called twice', () => {
      const cache = createCache();
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache,
        suppliers: [countedSupplier, countedSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      then('supplier called only once (cache hit on second call)', async () => {
        supplierCallCount = 0;
        await getConfig();
        const firstCallCount = supplierCallCount;

        await getConfig();
        const secondCallCount = supplierCallCount;

        expect(firstCallCount).toBeGreaterThan(0);
        expect(secondCallCount).toEqual(firstCallCount); // no additional calls
      });
    });
  });

  given('[case8] repo name from package.json', () => {
    when('[t0] repoName not provided', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, mockSecretSupplier],
        environment: testEnv,
        // repoName not provided - should read from package.json
      });

      const result = useBeforeAll(async () => getConfig());

      then('repo name derived from package.json', () => {
        // package.json has name: "sdk-config"
        expect(result.database.password).toEqual(
          'param:/sdk-config/test/database.password',
        );
      });

      then('config matches snapshot', () => {
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case9] multiple suppliers', () => {
    when('[t0] config uses both aws::param and aws::secret', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, mockSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      const result = useBeforeAll(async () => getConfig());

      then('each placeholder resolved by correct supplier', () => {
        expect(result.database.password).toContain('param:');
        expect(result.api.key).toContain('secret:');
      });

      then('config matches snapshot', () => {
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case10] file selection by environment', () => {
    const prodEnv = new SdkConfigEnvironment({
      access: 'prod',
      server: 'cloud',
    });

    // looser schema for prod config (json5 format)
    const prodSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
      }),
      api: z.object({
        key: z.string(),
        url: z.string(),
      }),
    });

    when('[t0] environment is prod', () => {
      const getConfig = genGetConfig({
        schema: prodSchema,
        statics: `${TEST_CONFIG_DIR}/*`, // matches both yml and json5
        cache: createCache(),
        suppliers: [mockParamSupplier, mockSecretSupplier],
        environment: prodEnv,
        repoName: 'test-svc',
      });

      then('selects prod.json5 config file', () => {
        const staticConfig = getConfig.static();
        // prod.json5 has host: 'db.prod.example.com'
        expect(staticConfig.database).toMatchObject({
          host: 'db.prod.example.com',
        });
        expect(staticConfig).toMatchSnapshot();
      });
    });
  });

  given('[case11] prod/cloud environment with schema mismatch', () => {
    const prodCloudEnv = new SdkConfigEnvironment({
      access: 'prod',
      server: 'cloud',
    });

    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // field that does not exist in config
      }),
      api: z.object({
        key: z.string(),
        url: z.string(),
      }),
    });

    when('[t0] schema mismatch in prod/cloud env', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const getConfig = genGetConfig({
        schema: badSchema,
        statics: `${TEST_CONFIG_DIR}/*`,
        cache: createCache(),
        suppliers: [mockParamSupplier, mockSecretSupplier],
        environment: prodCloudEnv,
        repoName: 'test-svc',
      });

      then('warns but returns config anyway', async () => {
        const result = await getConfig();

        // config returned despite schema mismatch
        expect(result.database.host).toEqual('db.prod.example.com');

        // warn was logged
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[sdk-config] validation failed'),
          expect.any(String),
        );

        expect(result).toMatchSnapshot();

        warnSpy.mockRestore();
      });
    });
  });

  given('[case12] config files not found', () => {
    when('[t0] statics glob matches no files', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.nonexistent`,
        cache: createCache(),
        suppliers: [mockParamSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      then('getConfig() throws BadRequestError', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(error.message).toMatchSnapshot();
      });

      then('getConfig.static() throws BadRequestError', async () => {
        const error = await getError(async () => getConfig.static());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(error.message).toMatchSnapshot();
      });
    });
  });
});
