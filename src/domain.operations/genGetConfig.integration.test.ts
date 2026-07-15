import { BadRequestError, getError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';
import { z } from 'zod';

import { join } from 'node:path';
import { SdkConfigEnvironment } from '../domain.objects/SdkConfigEnvironment';
import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import {
  SupplyAbsentError,
  SupplyDeniedError,
  SupplyError,
} from '../domain.objects/SupplyError';
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
    config: 'test',
    server: 'local@unix',
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
    // .note = deliberate mutation — a call counter is the simplest probe to prove
    //         the cache prevents repeat supplier calls; isolated to this case.
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
      config: 'prod',
      server: 'cloud@aws.lambda',
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
      config: 'prod',
      server: 'cloud@aws.lambda',
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

      // .note = the message echoes the caller's `statics` glob, which in tests is an
      //         ABSOLUTE path derived from __dirname. we redact the repo-root prefix
      //         (process.cwd()) to `<cwd>` so the snapshot keeps its coverage yet stays
      //         portable across machines/CI. the toContain proves the contract too.
      then('getConfig() throws BadRequestError', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(
          error.message.split(process.cwd()).join('<cwd>'),
        ).toMatchSnapshot();
      });

      then('getConfig.static() throws BadRequestError', async () => {
        const error = await getError(async () => getConfig.static());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(
          error.message.split(process.cwd()).join('<cwd>'),
        ).toMatchSnapshot();
      });
    });
  });

  // a supplier that persistently denies every secret (tolerable supply error)
  const deniedSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => {
      throw new SupplyDeniedError('access denied to secret', { path });
    },
  };

  given('[case13] optional field denied — tolerated, key omitted', () => {
    // api.key is marked optional; its supplier denies access
    const schemaOptionalKey = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
      }),
      api: z.object({
        key: z.string().optional(),
        url: z.string(),
      }),
    });

    when('[t0] getConfig() is called', () => {
      const getConfig = genGetConfig({
        schema: schemaOptionalKey,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, deniedSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      const result = useBeforeAll(async () => getConfig());

      then('resolves with the denied optional key omitted', () => {
        expect(result.api.key).toBeUndefined();
      });

      then('the readable fields are still filled', () => {
        expect(result.api.url).toEqual('https://api.test.example.com');
        expect(result.database.password).toEqual(
          'param:/test-svc/test/database.password',
        );
      });

      then('the resolved config matches snapshot', () => {
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case14] required field denied — hard throw (failfast env)', () => {
    // api.key is required (testSchema); its supplier denies access
    when('[t0] getConfig() is called', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, deniedSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then('throws BadRequestError with the denied path', () => {
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain(
          'config requires values that could not be read',
        );
        expect(scene.error.message).toContain('api.key');

        // snapshot the structured metadata (deterministic), not the message
        // string — the message bakes each cause's stack (absolute paths). mask
        // every denial's `cause` by type: the shape is asserted, the volatile
        // stack text is not.
        const error = scene.error;
        if (!(error instanceof BadRequestError)) throw error;
        expect(error.metadata).toMatchSnapshot({
          blockers: [{ cause: expect.any(SupplyError) }],
        });
      });
    });
  });

  given(
    '[case15] required field denied — hard throw even in prod/cloud',
    () => {
      // prod/cloud warns on schema drift, but a denied REQUIRED secret is a hard
      // failure regardless of environment
      const prodCloudEnv = new SdkConfigEnvironment({
        config: 'prod',
        server: 'cloud@aws.lambda',
      });

      when('[t0] getConfig() is called in prod/cloud', () => {
        const warnSpy = jest
          .spyOn(console, 'warn')
          .mockImplementation(() => {});

        const getConfig = genGetConfig({
          schema: testSchema,
          statics: `${TEST_CONFIG_DIR}/*`,
          cache: createCache(),
          suppliers: [mockParamSupplier, deniedSecretSupplier],
          environment: prodCloudEnv,
          repoName: 'test-svc',
        });

        const scene = useBeforeAll(async () => ({
          error: await getError(async () => getConfig()),
        }));

        then('throws hard (does not warn-and-continue)', () => {
          expect(scene.error).toBeInstanceOf(BadRequestError);
          expect(scene.error.message).toContain(
            'config requires values that could not be read',
          );

          // snapshot structured metadata, mask the denial `cause` by type
          const error = scene.error;
          if (!(error instanceof BadRequestError)) throw error;
          expect(error.metadata).toMatchSnapshot({
            blockers: [{ cause: expect.any(SupplyError) }],
          });
          warnSpy.mockRestore();
        });
      });
    },
  );

  given(
    '[case16] denied required leaf under an optional ancestor — hard-throws',
    () => {
      // contract narrowed (no-walk design): tolerance is decided leaf-first by
      // whether the schema accepts undefined at the denied path. here api.key is
      // REQUIRED; only its ancestor `api` is .optional(). a present api object
      // (url was read) with a required-undefined key does NOT conform, and we do
      // NOT delete the whole api node to force it (that would silently drop the
      // readable url). so this hard-throws. to tolerate, mark the LEAF optional:
      // `key: z.string().optional()` — which keeps url and omits key.
      const schemaOptionalApiNode = z.object({
        database: z.object({
          host: z.string(),
          port: z.number(),
          password: z.string(),
        }),
        api: z
          .object({
            key: z.string(),
            url: z.string(),
          })
          .optional(),
      });

      when('[t0] getConfig() is called', () => {
        const getConfig = genGetConfig({
          schema: schemaOptionalApiNode,
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [mockParamSupplier, deniedSecretSupplier],
          environment: testEnv,
          repoName: 'test-svc',
        });

        const scene = useBeforeAll(async () => ({
          error: await getError(async () => getConfig()),
        }));

        then(
          'throws — ancestor-optional does not tolerate a denied leaf',
          () => {
            expect(scene.error).toBeInstanceOf(BadRequestError);
            expect(scene.error.message).toContain(
              'config requires values that could not be read',
            );
            expect(scene.error.message).toContain('api.key');

            // snapshot structured metadata, mask the denial `cause` by type
            const error = scene.error;
            if (!(error instanceof BadRequestError)) throw error;
            expect(error.metadata).toMatchSnapshot({
              blockers: [{ cause: expect.any(SupplyError) }],
            });
          },
        );
      });
    },
  );

  given('[case17] denied nullable-only field — hard-throws', () => {
    // contract narrowed (no-walk design): .nullable()-only means "must be
    // PRESENT, value may be null" — it rejects undefined. an unreadable value is
    // undefined (we never observed a value; null is a value we did not see and
    // will not fabricate). so a denied nullable-only field does NOT conform and
    // hard-throws. to tolerate absence, mark it .nullish() (= optional+nullable).
    const schemaNullableKey = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
      }),
      api: z.object({
        key: z.string().nullable(),
        url: z.string(),
      }),
    });

    when('[t0] getConfig() is called', () => {
      const getConfig = genGetConfig({
        schema: schemaNullableKey,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, deniedSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then(
        'throws — nullable-only is required-present, undefined rejected',
        () => {
          expect(scene.error).toBeInstanceOf(BadRequestError);
          expect(scene.error.message).toContain(
            'config requires values that could not be read',
          );
          expect(scene.error.message).toContain('api.key');

          // snapshot structured metadata, mask the denial `cause` by type
          const error = scene.error;
          if (!(error instanceof BadRequestError)) throw error;
          expect(error.metadata).toMatchSnapshot({
            blockers: [{ cause: expect.any(SupplyError) }],
          });
        },
      );
    });
  });

  given(
    '[case18] optional field with a default, denied — default applies',
    () => {
      // api.key is optional with a .default(). when denied, fill omits it
      // (undefined); zod then applies the default on the absent value (Q1).
      const schemaDefaultKey = z.object({
        database: z.object({
          host: z.string(),
          port: z.number(),
          password: z.string(),
        }),
        api: z.object({
          key: z.string().default('fallback-key').optional(),
          url: z.string(),
        }),
      });

      when('[t0] getConfig() is called', () => {
        const getConfig = genGetConfig({
          schema: schemaDefaultKey,
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [mockParamSupplier, deniedSecretSupplier],
          environment: testEnv,
          repoName: 'test-svc',
        });

        const result = useBeforeAll(async () => getConfig());

        then(
          'resolves with the schema default in place of the denied key',
          () => {
            expect(result.api.key).toEqual('fallback-key');
          },
        );

        then('the resolved config matches snapshot', () => {
          expect(result).toMatchSnapshot();
        });
      });
    },
  );

  given('[case19] nullish field denied — omitted (undefined tolerated)', () => {
    // api.key is .nullish() (= optional + nullable). undefined is accepted, so
    // tolerance omits the key rather than fill null.
    const schemaNullishKey = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
      }),
      api: z.object({
        key: z.string().nullish(),
        url: z.string(),
      }),
    });

    when('[t0] getConfig() is called', () => {
      const getConfig = genGetConfig({
        schema: schemaNullishKey,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, deniedSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      const result = useBeforeAll(async () => getConfig());

      then('resolves with the nullish key omitted (undefined)', () => {
        expect(result.api.key).toBeUndefined();
      });

      then('the resolved config matches snapshot', () => {
        expect(result).toMatchSnapshot();
      });
    });
  });

  // a supplier whose secret is ABSENT (not-found), a tolerable supply error
  // distinct from a denial — both must be tolerated identically
  const absentSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => {
      throw new SupplyAbsentError('secret not found', { path });
    },
  };

  given(
    '[case20] optional field absent (not-found) — tolerated, omitted',
    () => {
      // proves the ABSENT branch of the tolerable-error taxonomy resolves the same
      // as the DENIED branch: fill catches the SupplyError base either way.
      const schemaOptionalKey = z.object({
        database: z.object({
          host: z.string(),
          port: z.number(),
          password: z.string(),
        }),
        api: z.object({
          key: z.string().optional(),
          url: z.string(),
        }),
      });

      when('[t0] getConfig() is called', () => {
        const getConfig = genGetConfig({
          schema: schemaOptionalKey,
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [mockParamSupplier, absentSecretSupplier],
          environment: testEnv,
          repoName: 'test-svc',
        });

        const result = useBeforeAll(async () => getConfig());

        then('resolves with the absent optional key omitted', () => {
          expect(result.api.key).toBeUndefined();
        });

        then('the resolved config matches snapshot', () => {
          expect(result).toMatchSnapshot();
        });
      });
    },
  );

  // the wish's literal proof scenario: a cicd pipeline split into two
  // oidc-scoped jobs that share ONE config. `apply` is a privilege ESCALATION
  // over `plan`: plan is the baseline grant (readable by BOTH jobs), apply is
  // the escalation (readable ONLY by the apply job). so plan.* is always
  // required and only the escalated apply.* leaves toggle optional.
  const TEST_CONFIG_CICD_DIR = join(
    __dirname,
    '../__test_assets__/config-cicd',
  );

  // build the schema for the escalation. tolerance is marked on each escalated
  // LEAF (.optional()), not the ancestor block — so a denied apply leaf is left
  // undefined and safeParse accepts it, while any readable peer in the same
  // block survives (no whole-node drop, no data loss). plan.* is never optional.
  const genCicdSchema = (grant: 'plan' | 'apply') =>
    z.object({
      role: z.object({
        cicd: z.object({
          plan: z.object({
            username: z.string(),
            password: z.string(),
          }),
          apply: z.object({
            username: grant === 'apply' ? z.string() : z.string().optional(),
            password: grant === 'apply' ? z.string() : z.string().optional(),
          }),
        }),
      }),
    });

  // a reader role denied on every param path that contains the denied token,
  // and able to read the rest. `null` denies none (the apply job's superset
  // grant). mirrors an oidc-scoped IAM policy.
  const genGrantScopedSupplier = (
    deniedToken: string | null,
  ): SdkConfigSupplier => ({
    scheme: 'aws::param',
    supply: async ({ path }) => {
      if (deniedToken && path.includes(deniedToken))
        throw new SupplyDeniedError('denied outside oidc grant', { path });
      return `param:${path}`;
    },
  });

  given(
    '[case21] cicd grant escalation — one config, per-job grant schema',
    () => {
      when('[t0] the plan job runs (GRANT=plan, denied on apply)', () => {
        const getConfig = genGetConfig({
          schema: genCicdSchema('plan'),
          statics: `${TEST_CONFIG_CICD_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [genGrantScopedSupplier('apply')],
          environment: testEnv,
          repoName: 'test-svc',
        });

        const result = useBeforeAll(async () => getConfig());

        then('the baseline plan fields are read', () => {
          expect(result.role.cicd.plan.username).toContain('param:');
          expect(result.role.cicd.plan.password).toContain('param:');
        });

        then(
          'the denied escalated apply fields are tolerated (undefined)',
          () => {
            expect(result.role.cicd.apply.username).toBeUndefined();
            expect(result.role.cicd.apply.password).toBeUndefined();
          },
        );
      });

      when(
        '[t1] the apply job runs (GRANT=apply, superset grant reads all)',
        () => {
          const getConfig = genGetConfig({
            schema: genCicdSchema('apply'),
            statics: `${TEST_CONFIG_CICD_DIR}/*.yml`,
            cache: createCache(),
            suppliers: [genGrantScopedSupplier(null)],
            environment: testEnv,
            repoName: 'test-svc',
          });

          const result = useBeforeAll(async () => getConfig());

          then('both grants are fully read (none tolerated)', () => {
            expect(result.role.cicd.plan.password).toContain('param:');
            expect(result.role.cicd.apply.password).toContain('param:');
          });
        },
      );

      when('[t2] boundary: plan job denied on the baseline plan grant', () => {
        // the baseline must always be readable — a denial there is a real failure
        // for either job, never tolerated (plan.* is never optional).
        const getConfig = genGetConfig({
          schema: genCicdSchema('plan'),
          statics: `${TEST_CONFIG_CICD_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [genGrantScopedSupplier('plan')],
          environment: testEnv,
          repoName: 'test-svc',
        });

        then('getConfig hard-throws (baseline denial is fatal)', async () => {
          const error = await getError(getConfig());
          expect(error).toBeInstanceOf(BadRequestError);
          expect(error.message).toContain('could not be read');
        });
      });

      when(
        '[t3] boundary: apply job denied on its required escalated grant',
        () => {
          // for the apply job the escalated apply.* is REQUIRED — a denial there is
          // fatal (unlike the plan job, which marks apply.* optional).
          const getConfig = genGetConfig({
            schema: genCicdSchema('apply'),
            statics: `${TEST_CONFIG_CICD_DIR}/*.yml`,
            cache: createCache(),
            suppliers: [genGrantScopedSupplier('apply')],
            environment: testEnv,
            repoName: 'test-svc',
          });

          then(
            'getConfig hard-throws (required escalated denial is fatal)',
            async () => {
              const error = await getError(getConfig());
              expect(error).toBeInstanceOf(BadRequestError);
              expect(error.message).toContain('could not be read');
            },
          );
        },
      );
    },
  );

  // a supplier whose param is present but EMPTY — the supplier throws a plain
  // BadRequestError (not a SupplyError), so this is NOT a tolerable supply error
  const emptyParamSupplier: SdkConfigSupplier = {
    scheme: 'aws::param',
    supply: async ({ path }) => {
      throw new BadRequestError('parameter value is empty', { path });
    },
  };

  given(
    '[case22] present-but-empty value is NOT tolerable, even if optional',
    () => {
      // documented boundary (like arrays): "unreadable" means absent/denied, not
      // present-but-empty. an empty value is a real value problem the supplier
      // rejects with a plain BadRequestError — it fails the instanceof SupplyError
      // check in fill, so it hard-throws regardless of schema optionality. this
      // test locks that boundary so a future refactor cannot silently tolerate it.
      const schemaOptionalKey = z.object({
        database: z.object({
          host: z.string(),
          port: z.number(),
          password: z.string().optional(),
        }),
      });

      when('[t0] getConfig() is called with an empty optional param', () => {
        const getConfig = genGetConfig({
          schema: schemaOptionalKey,
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [emptyParamSupplier, mockSecretSupplier],
          environment: testEnv,
          repoName: 'test-svc',
        });

        then(
          'it hard-throws (empty is not tolerated like absent/denied)',
          async () => {
            const error = await getError(async () => getConfig());
            expect(error).toBeInstanceOf(BadRequestError);
            expect(error.message).toContain('parameter value is empty');
          },
        );
      });
    },
  );

  given(
    '[case23] two required paths denied at once — both aggregate into one throw',
    () => {
      // database.password (aws::param) and api.key (aws::secret) are both required
      // in testSchema; deny BOTH schemes so two required-denied paths surface in a
      // single getConfig call. this locks that the throw carries every denied path,
      // not just the first — an on-call engineer sees the full set of what to fix.
      const deniedParamSupplier: SdkConfigSupplier = {
        scheme: 'aws::param',
        supply: async ({ path }) => {
          throw new SupplyDeniedError('access denied to param', { path });
        },
      };

      when('[t0] getConfig() is called', () => {
        const getConfig = genGetConfig({
          schema: testSchema,
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [deniedParamSupplier, deniedSecretSupplier],
          environment: testEnv,
          repoName: 'test-svc',
        });

        const scene = useBeforeAll(async () => ({
          error: await getError(async () => getConfig()),
        }));

        then('throws BadRequestError that names both denied paths', () => {
          expect(scene.error).toBeInstanceOf(BadRequestError);
          expect(scene.error.message).toContain(
            'config requires values that could not be read',
          );
          expect(scene.error.message).toContain('database.password');
          expect(scene.error.message).toContain('api.key');

          // snapshot structured metadata, mask BOTH denials' `cause` by type
          const error = scene.error;
          if (!(error instanceof BadRequestError)) throw error;
          expect(error.metadata).toMatchSnapshot({
            blockers: [
              { cause: expect.any(SupplyError) },
              { cause: expect.any(SupplyError) },
            ],
          });
        });
      });
    },
  );

  // a supplier that fails with a TRANSIENT error (throttle/network) — a plain
  // Error, NOT a SupplyError, so it is never tolerable regardless of optionality
  const transientSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async () => {
      throw new Error('network timeout: transient failure');
    },
  };

  given(
    '[case24] transient error on an optional field — never masked, hard-throws',
    () => {
      // the safety invariant with the highest cost if it regressed: an optional
      // field must NOT swallow a throttle/network error. only absent/denied
      // (SupplyError) is tolerable; a transient error propagates through the full
      // public getConfig() end-to-end, even when the field is marked optional.
      const schemaOptionalKey = z.object({
        database: z.object({
          host: z.string(),
          port: z.number(),
          password: z.string(),
        }),
        api: z.object({
          key: z.string().optional(),
          url: z.string(),
        }),
      });

      when('[t0] getConfig() is called', () => {
        const getConfig = genGetConfig({
          schema: schemaOptionalKey,
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [mockParamSupplier, transientSecretSupplier],
          environment: testEnv,
          repoName: 'test-svc',
        });

        then('the transient error propagates (not tolerated)', async () => {
          const error = await getError(async () => getConfig());
          expect(error.message).toContain('network timeout');
        });
      });
    },
  );

  given('[case25] denied-required alongside unrelated schema drift', () => {
    // one denied-required leaf (api.key, aws::secret) plus a separate pure
    // schema-drift issue (database.extra_field required by schema but absent
    // from config, no placeholder). the throw must be the 'could not be read'
    // path (a block is present), name the denied leaf, surface the drift issue
    // in errors — and NOT mis-attribute the drift as a denial (denials holds
    // only api.key). locks that a co-occurrent drift is neither dropped nor
    // mislabeled as unreadable.
    const schemaWithDrift = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        extra_field: z.string(), // absent from config → pure drift, no denial
      }),
      api: z.object({
        key: z.string(),
        url: z.string(),
      }),
    });

    when('[t0] getConfig() is called', () => {
      const getConfig = genGetConfig({
        schema: schemaWithDrift,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [mockParamSupplier, deniedSecretSupplier],
        environment: testEnv,
        repoName: 'test-svc',
      });

      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then('throws the could-not-be-read path (a block is present)', () => {
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain(
          'config requires values that could not be read',
        );
      });

      then('names the denied leaf and surfaces the drift issue', () => {
        expect(scene.error.message).toContain('api.key');
        expect(scene.error.message).toContain('extra_field');
      });

      then('does not mis-attribute the drift as a denial', () => {
        // denials holds only the denied leaf; the drift field is absent from it.
        // snapshot structured metadata, mask the single denial `cause` by type
        const error = scene.error;
        if (!(error instanceof BadRequestError)) throw error;
        expect(error.metadata).toMatchSnapshot({
          blockers: [{ cause: expect.any(SupplyError) }],
        });
      });
    });
  });
});
