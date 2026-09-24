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
import type { SupplyTolerance } from '../domain.objects/SupplyTolerance';
import { genGetConfig } from './genGetConfig';

const TEST_CONFIG_DIR = join(__dirname, '../.test/assets/config');

/**
 * .what = redact the host path from a message, so its snapshot is portable
 * .why = the repo refusals carry the absolute `package.json` path, which is the
 *        useful half of the message in production and the one half that cannot
 *        go into a `.snap` (`rule.require.hermetic-tests`).
 *
 * .note = the marker is `<cwd>`, the word every other redaction site in this
 *         repo uses for this same value (`r6 nitpick.1`, i003). ⛔ do NOT coin
 *         a second word for `process.cwd()`.
 *
 * .note = a TWIN of this lives in `getOneRepo.integration.test.ts`. two copies
 *         is the correct call (`rule.prefer.wet-over-dry` — wait for three); a
 *         THIRD site is the trigger to promote one shared test helper.
 */
const asPortableMessage = (input: { message: string }): string =>
  input.message.split(process.cwd()).join('<cwd>');

describe('genGetConfig', () => {
  // .note = FAKES, never mocks. `rule.forbid.integration.mocks` bars a mock at
  //         this grade, and these are neither — a supplier is a declared
  //         extension point of the public api, so to pass one is to USE the
  //         contract rather than to stub around it. each echoes the path it was
  //         handed, which is what makes the derived ADDRESS assertable without
  //         an aws round trip.
  // .why   = the real-aws coverage for the supplier boundary itself lives in
  //          genSdkConfigSupplierAws*.integration and the acceptance suites.
  //          what this file grades is genGetConfig's ORCHESTRATION.
  const fakeParamSupplier: SdkConfigSupplier = {
    scheme: 'aws::param',
    supply: async ({ path }) => `param:${path}`,
  };

  const fakeSecretSupplier: SdkConfigSupplier = {
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
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: testEnv,
      });

      const result = useBeforeAll(async () => getConfig());

      then('returns typed config with filled secrets', () => {
        expect(result.database.password).toEqual(
          'param:/test-org/test-svc/test/database.password',
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
        suppliers: [fakeParamSupplier],
        environment: testEnv,
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
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: testEnv,
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
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: testEnv,
      });

      const result = useBeforeAll(async () => getConfig());

      then('path is auto-derived from org + repo + choice + keyPath', () => {
        // the fixture declares `repository: test-svc`
        expect(result.database.password).toEqual(
          'param:/test-org/test-svc/test/database.password',
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
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: testEnv,
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

  given('[case9] multiple suppliers', () => {
    when('[t0] config uses both aws::param and aws::secret', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: testEnv,
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
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: prodEnv,
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
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: prodCloudEnv,
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
        suppliers: [fakeParamSupplier],
        environment: testEnv,
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
        suppliers: [fakeParamSupplier, deniedSecretSupplier],
        environment: testEnv,
      });

      const result = useBeforeAll(async () => getConfig());

      then('resolves with the denied optional key omitted', () => {
        expect(result.api.key).toBeUndefined();
      });

      then('the readable fields are still filled', () => {
        expect(result.api.url).toEqual('https://api.test.example.com');
        expect(result.database.password).toEqual(
          'param:/test-org/test-svc/test/database.password',
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
        suppliers: [fakeParamSupplier, deniedSecretSupplier],
        environment: testEnv,
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
          suppliers: [fakeParamSupplier, deniedSecretSupplier],
          environment: prodCloudEnv,
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
          suppliers: [fakeParamSupplier, deniedSecretSupplier],
          environment: testEnv,
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
        suppliers: [fakeParamSupplier, deniedSecretSupplier],
        environment: testEnv,
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
          suppliers: [fakeParamSupplier, deniedSecretSupplier],
          environment: testEnv,
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
        suppliers: [fakeParamSupplier, deniedSecretSupplier],
        environment: testEnv,
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
          suppliers: [fakeParamSupplier, absentSecretSupplier],
          environment: testEnv,
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
  const TEST_CONFIG_CICD_DIR = join(__dirname, '../.test/assets/config-cicd');

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
          suppliers: [emptyParamSupplier, fakeSecretSupplier],
          environment: testEnv,
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
          suppliers: [fakeParamSupplier, transientSecretSupplier],
          environment: testEnv,
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
        suppliers: [fakeParamSupplier, deniedSecretSupplier],
        environment: testEnv,
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

  // ── the org segment ──────────────────────────────────────────────────────
  // a config dir that deliberately declares NO `organization`. every other
  // fixture declares one, so this is the only way to reach the state a required
  // field forbids. ⛔ do not add the key to it.
  const TEST_CONFIG_NOORG_DIR = join(__dirname, '../.test/assets/config-noorg');

  // the three repo fixtures, one per route the repo can take. ⛔ do not add a
  // `repository` key to the first, unscope the second, or fill the third —
  // each file's whole job is the value it carries. see [case32].
  const TEST_CONFIG_NOREPO_DIR = join(
    __dirname,
    '../.test/assets/config-norepo',
  );
  const TEST_CONFIG_SCOPEDREPO_DIR = join(
    __dirname,
    '../.test/assets/config-scopedrepo',
  );
  const TEST_CONFIG_BADREPO_BLANK_DIR = join(
    __dirname,
    '../.test/assets/config-badrepo-blank',
  );

  // no org, and every uri EXPLICIT — so no path needs a derive. ⛔ do not add
  // the key, and do not swap an explicit path for a bare one. see [case28] [t3].
  const TEST_CONFIG_NOORG_ALLEXPLICIT_DIR = join(
    __dirname,
    '../.test/assets/config-noorg-allexplicit',
  );

  // the same all-explicit shape, but the org is PRESENT and MALFORMED. the pair
  // parts two different builds: the fixture above catches a LAZY call, this one
  // catches a lazy VALIDATION — a build that calls getOneOrg always but defers
  // its literal check passes that one and fails only here. [case28] [t4].
  const TEST_CONFIG_BADORG_ALLEXPLICIT_DIR = join(
    __dirname,
    '../.test/assets/config-badorg-allexplicit',
  );

  // 🔴 the two REMAINING malformed-org shapes, each with a BARE uri. `getOneOrg`
  //    raises three distinct malformed sentences and only the placeholder one
  //    had reached this grade — `r2 blocker.1` (i003), conceded.
  //
  // ⚠️ the gap was an INCONSISTENCY, not merely a coverage hole, and it is the
  //    same lesson one level deeper: i had already conceded that a refusal a
  //    caller meets must be snapped where they meet it, swept the placeholder
  //    form to all three grades at i002 — and left its two peers unit-only.
  //    a principle applied to one of three peers is not a principle.
  //
  // ⛔ do not merge these two dirs. they part different guards: the map reaches
  //    the `typeof` check, the blank string PASSES it and is caught only by the
  //    empty-guard after the trim. one fixture cannot reach both.
  const TEST_CONFIG_BADORG_NONLITERAL_DIR = join(
    __dirname,
    '../.test/assets/config-badorg-nonliteral',
  );
  const TEST_CONFIG_BADORG_BLANK_DIR = join(
    __dirname,
    '../.test/assets/config-badorg-blank',
  );

  // two choices, two DIFFERENT orgs. ⛔ do not reconcile them — the disagreement
  // IS the fixture. every other config dir declares one org across its files,
  // so this pair is the only place the per-choice read is observable. [case29].
  const TEST_CONFIG_MULTIORG_DIR = join(
    __dirname,
    '../.test/assets/config-multiorg',
  );

  // notes the paths a supplier was ASKED for, so a test asserts the address
  // rather than re-derives it. `verdict` decides what happens next.
  const genNotedParamSupplier = (input: {
    paths: string[];
    verdict: 'supply' | 'absent';
  }): SdkConfigSupplier => ({
    scheme: 'aws::param',
    supply: async ({ path }) => {
      input.paths.push(path);
      if (input.verdict === 'absent')
        throw new SupplyAbsentError('parameter not found', { path });
      return `param:${path}`;
    },
  });

  given(
    '[case26] org declared, param NOT yet moved to the derived path',
    () => {
      // the sharp critipath a repo hits the day it adopts: the org is declared,
      // the derive points at the new address, and the param still sits at the old
      // one. the error must carry the DERIVED path, so oncall reads one line and
      // knows exactly what to create.
      const paths: string[] = [];

      when('[t0] getConfig() is called and the param is absent', () => {
        const getConfig = genGetConfig({
          schema: testSchema,
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [
            genNotedParamSupplier({ paths, verdict: 'absent' }),
            fakeSecretSupplier,
          ],
          environment: testEnv,
        });

        const scene = useBeforeAll(async () => ({
          error: await getError(async () => getConfig()),
        }));

        then('it throws, because the value is required', () => {
          expect(scene.error).toBeInstanceOf(BadRequestError);
          expect(scene.error.message).toContain(
            'config requires values that could not be read',
          );
        });

        then('and the error carries the ORG-SCOPED path it looked at', () => {
          // 🔴 the load-bearer. an error that named the OLD two-segment path would
          //    send oncall to create a param the code will never read again.
          expect(scene.error.message).toContain(
            '/test-org/test-svc/test/database.password',
          );
        });

        then('the supplier was asked for the four-segment address', () => {
          expect(paths).toContain('/test-org/test-svc/test/database.password');
        });
      });
    },
  );

  given('[case27] two orgs, one repo name — the collision is barred', () => {
    // the motive of the whole behavior, at the factory grain: two repos that
    // share a name and an aws account must not share a param path.
    const pathsOrgA: string[] = [];
    const pathsOrgB: string[] = [];

    when('[t0] each declares its own org, in its own config', () => {
      // 🔴 two CONFIGS, over two call sites — because both segments are
      //    declared, never passed. the two fixture dirs name the SAME
      //    `repository` (`test-svc`) and DIFFERENT orgs, so the repo segment
      //    collides by construction and only the declared org can part them.
      //    that is the whole motive of the behavior, at the factory grain.
      const scene = useBeforeAll(async () => {
        const getOrgA = genGetConfig({
          schema: testSchema,
          statics: `${TEST_CONFIG_DIR}/*.yml`, // declares `test-org`
          cache: createCache(),
          suppliers: [
            genNotedParamSupplier({ paths: pathsOrgA, verdict: 'supply' }),
            fakeSecretSupplier,
          ],
          environment: testEnv,
        });
        const getOrgB = genGetConfig({
          schema: testSchema,
          statics: `${TEST_CONFIG_MULTIORG_DIR}/*.yml`, // declares `org-of-test`
          cache: createCache(),
          suppliers: [
            genNotedParamSupplier({ paths: pathsOrgB, verdict: 'supply' }),
            fakeSecretSupplier,
          ],
          environment: testEnv,
        });
        await getOrgA();
        await getOrgB();
        return { ran: true };
      });

      then('neither reads the other org path', () => {
        expect(scene.ran).toEqual(true);
        expect(pathsOrgA).toEqual([
          '/test-org/test-svc/test/database.password',
        ]);
        expect(pathsOrgB).toEqual([
          '/org-of-test/test-svc/test/database.password',
        ]);
      });

      then('and the two address sets are disjoint', () => {
        for (const path of pathsOrgA) expect(pathsOrgB).not.toContain(path);
      });

      // 🔴 the BARRED COLLISION, SNAPPED — `r010` (i008), a loose end the lane
      //    named and declined to hold the stone on. taken anyway. the vision
      //    calls this case "the one to read": it is the motive of the whole
      //    behavior, and it was the one case in the exhaustiveness sweep that
      //    fell outside the sweep's own table.
      //
      //    the two `then` blocks above each prove HALF of it — one pins the
      //    literals, the other proves disjointness — and a reviewer must hold
      //    both to see the point. the snapshot puts the two namespaces side by
      //    side, so the barred collision is legible in a PR diff at a glance.
      //
      //    ⇒ no mask is owed: every byte is deterministic. the orgs come from
      //      two fixture configs and the repo segment is a literal, so there is
      //      no per-run value to carve out.
      then('and the two NAMESPACES are pinned, side by side', () => {
        expect({ orgA: pathsOrgA, orgB: pathsOrgB }).toMatchSnapshot();
      });
    });
  });

  given('[case28] a config with no organization refuses to boot', () => {
    const paths: string[] = [];

    when('[t0] the config declares none', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_NOORG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [
          genNotedParamSupplier({ paths, verdict: 'supply' }),
          fakeSecretSupplier,
        ],
        environment: testEnv,
      });

      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then('it throws, and names the field', () => {
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain('organization');
      });

      then('and teaches the one remedy — edit the config', () => {
        // 🔴 one source, one remedy. a message that also named a call-site fix
        //    would advertise a surface that does not exist, and send a reader
        //    to look for an `org` argument they cannot pass.
        expect(scene.error.message).toContain('your-org');
        expect(scene.error.message).not.toContain('genGetConfig');
      });

      then('the SENTENCE a config author reads is pinned, here', () => {
        // 🔴 this snapshot is at the ORCHESTRATION surface on purpose, and it
        //    is not a duplicate of `getOneOrg.test.ts`'s.
        //
        //    the unit snapshot pins what `getOneOrg` THROWS. this pins what a
        //    config author MEETS — the same sentence, raised through
        //    `genGetConfig` with its context, at the one factory boundary a
        //    new consumer actually calls. the two can drift apart the moment
        //    a wrapper re-words or re-wraps the throw, and only this one
        //    reddens when it does.
        //
        // ⇒ the `toContain` pair above proves the two remedies are NAMED; a
        //   snapshot is what proves the sentence is still READABLE. a peer
        //   caught that this surface asserted the first and never the second.
        //
        // .note = no path normalization is owed here, unlike the `getOneRepo`
        //         snapshots. this refusal fires BEFORE any file path enters
        //         the message — it names a field and two remedies, and every
        //         token in it is authored, so it is hermetic as written.
        expect(scene.error.message).toMatchSnapshot();
      });

      then('NO supplier was ever asked for a path', () => {
        // 🔴 the one assertion that fails on a quiet fallback. a build that
        //    dropped back to the old two-segment derive would still throw a
        //    schema error later — but the store would have been READ, at the
        //    un-namespaced path this behavior exists to make unreachable.
        expect(paths).toEqual([]);
      });
    });

    when('[t1] the same config, read through .static()', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_NOORG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: testEnv,
      });

      then('it throws too — BOTH surfaces are held to the org', async () => {
        // 🔴 `.static()` is a boot, and F8 asked that an absent org never boot.
        //    a check that reached only the fill path would let a repo that
        //    consumes `.static()` alone run forever on an absent
        //    `organization`, and fire the refusal the day someone first calls
        //    `getConfig()` — months later, by another author. that is Q8's
        //    landmine at the one boundary the derive never touches.
        //
        // ⚠️ it costs no i/o. `.static()` reads and parses the file on every
        //    call regardless, and the org is read as part of that parse — so
        //    no surface is slower and none gained a side effect.
        const error = await getError(async () => getConfig.static());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('organization');
      });

      then('the raw shape is still reachable when an org IS declared', () => {
        // the complement: the refusal is about the ORG, never about the raw
        // read. point at a config that declares one and `.static()` returns the
        // file's own shape, unfilled and unvalidated against the schema.
        const getConfigWithOrg = genGetConfig({
          schema: testSchema,
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [fakeParamSupplier, fakeSecretSupplier],
          environment: testEnv,
        });

        const raw = getConfigWithOrg.static();
        expect(raw.organization).toEqual('test-org'); // the declared org
        expect(raw.database).toBeDefined(); // and the raw read still works
      });
    });

    when(
      '[t2] no org, and EVERY uri is explicit — no path needs a derive',
      () => {
        const pathsAllExplicit: string[] = [];
        const getConfig = genGetConfig({
          schema: testSchema,
          statics: `${TEST_CONFIG_NOORG_ALLEXPLICIT_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [
            genNotedParamSupplier({
              paths: pathsAllExplicit,
              verdict: 'supply',
            }),
            fakeSecretSupplier,
          ],
          environment: testEnv,
        });

        then(
          'it STILL throws — the org is required, derive or no derive',
          async () => {
            // 🔴 the ONLY clamp that parts F8's ALWAYS read from a LAZY one. a lazy
            //    build reads the org only when a bare `$.at()` needs it — no value
            //    here does, so a lazy build boots this config and every OTHER test
            //    in the repo stays green.
            //
            // .why ALWAYS, per the wisher: "lazy is a landmine". a lazy check lets
            //      an all-explicit repo run for months with a bad field, then fires
            //      the day someone adds one bare placeholder — an explosion parted
            //      from its cause by both time and author.
            const error = await getError(async () => getConfig());
            expect(error).toBeInstanceOf(BadRequestError);
            expect(error.message).toContain('organization');
          },
        );

        then('and the explicit paths were never read either', async () => {
          // the cost of ALWAYS, made visible: this repo consumes no org at all,
          // and is still refused. that is deliberate (vision case=4 [t2]).
          //
          // ⛔ do NOT reset with `pathsAllExplicit.length = 0` before the call.
          //    it mutates a `const` shared with the peer block
          //    (`rule.require.immutable-vars`), and it is a quiet failhide: a
          //    regression that leaked a read in the `[t0]` block would have its
          //    evidence wiped before this assertion could see it. the same warn
          //    is written at `blackbox/sdk-config.acceptance.test.ts` [case14].
          //
          // ⇒ no reset is owed. the org refusal throws BEFORE any supplier runs,
          //   so the array is already empty, and this assertion covers BOTH
          //   calls.
          await getError(async () => getConfig());
          expect(pathsAllExplicit).toEqual([]);
        });
      },
    );

    when('[t3] a caller reaches for an org at the call site', () => {
      then('there is no `org` key to reach for — clamped at the TYPE', () => {
        // 🔴 a TYPE-level clamp, and it is the only kind that can hold this
        //    claim. the org has ONE source, so this factory must offer no
        //    second — and a second source is not a runtime state any assertion
        //    could observe. it is a key, and a key is a type.
        //
        // ⚠️ it goes red the moment the key returns: ts reports an UNUSED
        //    `@ts-expect-error` and the `types` gate fails. so the directive
        //    below carries the whole clamp — do not delete it to quiet a build.
        //
        // .why = an override multiplies the experience space rather than adds
        //        to it: a precedence rule, an absent-org state, two error
        //        wordings per throw, and an optional ARGUMENT for a REQUIRED
        //        VALUE (`rule.forbid.combinatorial-explosion`,
        //        `ehmpathy/rhachet-roles-ehmpathy#674`).
        //
        // .note = to pin a different org, edit the config. the opt-out is a
        //         DIFFERENT literal there — `"organization": "_"` derives
        //         `/_/…`, clamped at `getOneOrg` [case1] [t1].
        const gen = () =>
          genGetConfig({
            schema: testSchema,
            statics: `${TEST_CONFIG_DIR}/*.yml`,
            cache: createCache(),
            suppliers: [fakeParamSupplier, fakeSecretSupplier],
            environment: testEnv,

            // @ts-expect-error — there is no `org` key. the config declares it.
            org: 'acme',
          });
        expect(typeof gen).toEqual('function');
      });
    });

    when(
      '[t4] a MALFORMED org, and every uri is explicit — vision case=4 [t2]',
      () => {
        const pathsBadOrg: string[] = [];
        const getConfig = genGetConfig({
          schema: testSchema,
          statics: `${TEST_CONFIG_BADORG_ALLEXPLICIT_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [
            genNotedParamSupplier({ paths: pathsBadOrg, verdict: 'supply' }),
            fakeSecretSupplier,
          ],
          environment: testEnv,
        });

        then(
          'it throws — the org is VALIDATED, derive or no derive',
          async () => {
            // 🔴 the peer of [t2], and it parts a different build. [t2] catches a
            //    LAZY CALL; this catches a lazy VALIDATION — a build that calls
            //    getOneOrg always but defers its literal check to the moment a
            //    derive needs the value passes [t2] (whose field is `undefined`,
            //    so the required-field guard fires first) and fails only here.
            //
            // ⚠️ so the two assertions differ on purpose: [t2] reaches the
            //    required-field throw, this reaches the literal-string one. a
            //    build that collapsed them would send a reader with a PRESENT
            //    field to go add the field they had already written.
            const error = await getError(async () => getConfig());
            expect(error).toBeInstanceOf(BadRequestError);
            expect(error.message).toContain('placeholder');
            expect(error.message).not.toContain('lacks a required');

            // 🔴 the SENTENCE, pinned at this grade — `r2 blocker.1` (i002),
            //    conceded. the `toContain` pair above proves the two refusals
            //    are DISCRIMINATED; only a snapshot proves this one is still
            //    readable, and a reviewer sees it in the PR diff without a run.
            //
            // ⚠️ the peer caught an INCONSISTENCY, not merely a gap: i had
            //    already conceded this exact principle for the no-org twin and
            //    snapped it at all three grades, then left its peer refusal —
            //    the one a config author with a typo meets — asserted only.
            //    a principle applied to one of two peers is not a principle.
            //
            // .note = no mask, and no path normalization. this refusal fires
            //         before any file path enters the message; every token in
            //         it is authored, so it is hermetic as written — the same
            //         property recorded at [t0]'s snapshot.
            expect(error.message).toMatchSnapshot();
          },
        );

        then(
          'and no supplier ran — the refusal precedes every read',
          async () => {
            // 🔴 this assertion names the HARM, and it was measured rather than
            //    reasoned. dogfooded 2026-09-18: the placeholder guard in
            //    `getOneOrg` was disabled, and this went red with
            //
            //      Received: ["/org", "/hand/written/db/password"]
            //
            //    ⇒ `/org` is the ORG'S OWN placeholder, sent to the param store
            //      as though it were a config value to fill. so a build with no
            //      guard does not merely derive a bad path — it issues a store
            //      read for the org itself, at a path the author never wrote.
            //
            // ⚠️ [t2] stayed GREEN through that same break, which is the whole
            //    reason this block exists beside it.
            //
            // ⛔ do NOT reset `pathsBadOrg` before this call, for the reason
            //    written at [t2]: it mutates a shared `const` and wipes the
            //    evidence a leak in the block above would have left.
            await getError(async () => getConfig());
            expect(pathsBadOrg).toEqual([]);
          },
        );
      },
    );

    when('[t5] the org is declared as a MAP, not a literal', () => {
      const pathsNonLiteral: string[] = [];
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_BADORG_NONLITERAL_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [
          genNotedParamSupplier({ paths: pathsNonLiteral, verdict: 'supply' }),
          fakeSecretSupplier,
        ],
        environment: testEnv,
      });

      then('it throws, and names THIS malformation', async () => {
        // ⚠️ the `not.toContain` pair is what makes this case discriminate. a
        //    build that collapsed the three malformed throws into one generic
        //    sentence would pass a bare `toBeInstanceOf` and send a reader with
        //    a MAP to go delete a placeholder they never wrote.
        //
        // 🔴 the second assertion is on the PEER THROW'S HEADLINE — `cannot be
        //    a placeholder` — never on the bare word. measured 2026-09-18: a
        //    bare `not.toContain('placeholder')` went RED here, and the code was
        //    right. this throw's own hint says *"a placeholder is not filled
        //    here"*, on purpose: the reader who wrote a map is one keystroke
        //    from a `$.at()` instead, and the hint heads that off.
        //
        // ⇒ so the word appears in BOTH messages and discriminates neither. the
        //   headline is what a caller reads first, and what parts the two.
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('literal string');
        expect(error.message).not.toContain('cannot be a placeholder');
        expect(error.message).not.toContain('lacks a required');
      });

      then('the SENTENCE a config author reads is pinned, here', async () => {
        // 🔴 this snapshot is the point of the case — `r2 blocker.1` (i003).
        //    the unit grade already pins what `getOneOrg` THROWS; this pins
        //    what a config author MEETS, through the one factory a consumer
        //    calls. the two drift the moment a wrapper re-words or re-wraps
        //    the throw, and only this one reddens when it does.
        //
        // .note = no mask and no path normalization, for the reason recorded
        //         at `[t0]` and `[t4]`: this refusal fires before any file path
        //         enters the message, so every token in it is authored.
        const error = await getError(async () => getConfig());
        expect(error.message).toMatchSnapshot();
      });

      then(
        'and no supplier ran — the refusal precedes every read',
        async () => {
          // the derive in this fixture is BARE, so a build that deferred the
          // literal check to fill-time would splice `[object Object]` and issue a
          // real store read at `/[object Object]/test-svc/test/…`. this is the
          // assertion that names that harm.
          await getError(async () => getConfig());
          expect(pathsNonLiteral).toEqual([]);
        },
      );
    });

    when('[t6] the org is a BLANK string — whitespace only', () => {
      const pathsBlank: string[] = [];
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_BADORG_BLANK_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [
          genNotedParamSupplier({ paths: pathsBlank, verdict: 'supply' }),
          fakeSecretSupplier,
        ],
        environment: testEnv,
      });

      then('it throws, and names THIS malformation', async () => {
        // 🔴 the one malformed value a `typeof` check cannot catch — `'   '` IS
        //    a literal string, so it passes the guard `[t5]` reaches and is
        //    refused only by the empty-guard after the trim.
        //
        // ⚠️ so `not.toContain('literal string')` is the load-bearer here: it
        //    is what goes red if someone deletes the `.trim()` and the value
        //    falls through to a blank spliced segment, or if the two throws are
        //    merged into one.
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('empty');
        expect(error.message).not.toContain('literal string');
        expect(error.message).not.toContain('lacks a required');
      });

      then('the SENTENCE a config author reads is pinned, here', async () => {
        // the third of three, and the last one unsnapped at this grade. see
        // `[t5]`'s note for why the unit snapshot does not stand in for it.
        const error = await getError(async () => getConfig());
        expect(error.message).toMatchSnapshot();
      });

      then(
        'and no supplier ran — the refusal precedes every read',
        async () => {
          await getError(async () => getConfig());
          expect(pathsBlank).toEqual([]);
        },
      );
    });
  });

  given('[case29] two choices in one repo declare DIFFERENT orgs', () => {
    // ⇒ catalog: `1.vision.experience.case=8.org-varies-per-choice.md`, cell
    //   `f2` on axis F (org-agreement = `divergent`). the axis was added to the
    //   catalog AFTER this test, by the `r5` peer review
    //   (`rule.require.experience-catalog-evolution`, backward terminus).
    //
    // 🔴 the vision calls this "structural, not chosen": the org's source is the
    //    static config, which loads PER FILL, so there is no repo-wide read to
    //    hoist it to. and the vision's own awkward #6 predicts a later author
    //    will read the asymmetry with `repo` — fixed once, at factory time —
    //    as an inconsistency and want to "fix" it.
    //
    // ⚠️ that refactor is what this case exists to catch, and until it was
    //    written not one test could: all three `config/*` fixtures declare the
    //    same `test-org`, so a build that read one file, cached across choices,
    //    or hoisted to a module singleton derived the right path anyway.
    const prepEnv = new SdkConfigEnvironment({
      config: 'prep',
      server: 'local@unix',
    });

    when('[t0] the `test` choice is filled', () => {
      const paths: string[] = [];
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_MULTIORG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [
          genNotedParamSupplier({ paths, verdict: 'supply' }),
          fakeSecretSupplier,
        ],
        environment: testEnv,
      });

      then('it derives with test.yml own org', async () => {
        await getConfig();
        expect(paths).toEqual(['/org-of-test/test-svc/test/database.password']);
      });
    });

    when('[t1] the `prep` choice is filled, same repo, same statics', () => {
      const paths: string[] = [];
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_MULTIORG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [
          genNotedParamSupplier({ paths, verdict: 'supply' }),
          fakeSecretSupplier,
        ],
        environment: prepEnv,
      });

      then('it derives with prep.yml OWN org, never test.yml', async () => {
        // the two assertions are one claim: the org tracks the CHOICE, and a
        // build that resolved it once would leak `org-of-test` into this path.
        await getConfig();
        expect(paths).toEqual(['/org-of-prep/test-svc/prep/database.password']);
        expect(paths[0]).not.toContain('org-of-test');
      });
    });
  });

  given('[case31] the blocker a human reads names the ORG-SCOPED path', () => {
    // 🔴 the vision's `case=5` — org declared, param not yet moved — and F6
    //    promotes it to the transition state EVERY repo passes through on
    //    adoption. its whole weight sits on one claim: *"the derived path
    //    appears verbatim in the error's cause, so oncall reads one line and
    //    knows the move."*
    //
    // ⚠️ that claim was clamped NOWHERE. every other blocker assertion in this
    //    file masks the cause — `toMatchSnapshot({ blockers: [{ cause:
    //    expect.any(SupplyError) }] })` — which is correct, since the message
    //    bakes a volatile stack, and which ALSO erases the one field this case
    //    rests on. and `asFilledConfig [case9]` proves only that the path
    //    reaches `omissions`, one layer BELOW the blocker.
    //
    // 🟡 PROBED, and the result corrected the reason above rather than
    //    confirmed it. two probes, neither unique: a `cause` dropped in
    //    `getAllBlockedSupplies` reddens **9**, since the masked snapshots
    //    still assert `expect.any(SupplyError)`; a derive reverted to two
    //    segments reddens **13**. ⇒ the claim IS covered — by the CONJUNCTION
    //    of three clamps in three files (the path reaches `omissions`, the
    //    cause survives into the blocker, the derive carries the org).
    //
    // ⇒ this case stays anyway, and for a stated reason: a claim proven only
    //   by a conjunction across three files is not a demonstration a reviewer
    //   can find. the vision's `case=5` owes ONE test that exercises it
    //   end-to-end, at the grain a human reads
    //   (`rule.require.experience-catalog-evolution`, the verification
    //   terminus). this is that test, and it is a terminus over a clamp.
    const absentParamSupplier: SdkConfigSupplier = {
      scheme: 'aws::param',
      supply: async ({ path }) => {
        throw new SupplyAbsentError('parameter not found', { path });
      },
    };

    when('[t0] a required field behind a BARE uri cannot be read', () => {
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [absentParamSupplier, fakeSecretSupplier],
        environment: testEnv,
      });

      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then('the error carries the derived address, verbatim', () => {
        expect(scene.error).toBeInstanceOf(BadRequestError);
        // the whole address, in one string — this is the line oncall reads
        expect(String(scene.error)).toContain(
          '/test-org/test-svc/test/database.password',
        );
      });

      then('and the blocker cause holds it EXACTLY, org and all', () => {
        // 🔴 the F8 clamp at this grade. a build that fell back to the old
        //    two-segment derive would ALSO produce a legible error — just a
        //    legible WRONG one, pointed at the shared namespace this behavior
        //    exists to make unreachable.
        //
        // ⛔ do NOT restate this as `not.toContain('/svc-notifications/test/…')`.
        //    it CANNOT pass: the un-namespaced path sits inside the org-scoped
        //    one as a plain text run, so the assertion fails whenever the code
        //    is CORRECT. that is the F4 trap — the same shape `org` inside
        //    `organization` sets — and it reaches any `not.toContain` where one
        //    valid value nests inside another.
        //
        // ⇒ the exact read below sidesteps the containment question AND claims
        //   strictly more: the address is that path, and no other.
        const error = scene.error;
        if (!(error instanceof BadRequestError)) throw error;
        // .note = an `as` cast at a third-party boundary, which is the one
        //         exemption `rule.forbid.as-cast` grants — `helpful-errors`
        //         hands a caught error's `metadata` back untyped, and no
        //         `instanceof` recovers the generic the throw site declared.
        //
        // 🔴 the cast names the OWNED type, never a hand-rolled shape, so a
        //    later edit to `SupplyOmission.cause` or to `SupplyError`'s
        //    metadata generic breaks THIS LINE at compile time.
        //
        // ⛔ do NOT spell the shape inline as
        //    `{ cause: { metadata: { path: string } } }[]`. it asserts the
        //    same claim today, re-declares a contract this repo already owns
        //    (`rule.require.shapefit`), and — measured — compiles straight
        //    through a DELETED contract, then asserts against it. a cast
        //    chooses which type the compiler checks you against; an inline
        //    shape opts out of that check and still looks like a cast.
        const { blockers } = error.metadata as {
          blockers: SupplyTolerance<'block'>[];
        };
        expect(blockers.map((blocker) => blocker.cause.metadata.path)).toEqual([
          '/test-org/test-svc/test/database.password',
        ]);
      });

      then('the blocker still names the config key and the reason', () => {
        // the address is an ADDITION to what oncall already had, never a
        // replacement — both halves are needed to act
        expect(String(scene.error)).toContain('database.password');
        expect(String(scene.error)).toContain('absent');
      });
    });
  });

  given('[case30] the `organization` field belongs to the CONSUMER', () => {
    // ⇒ catalog: `1.vision.experience.case=9.the-consumers-own-field.md`, cells
    //   `g1`/`g2` on axis G (schema-declares). the axis was added to the catalog
    //   AFTER this test, by the `r5` peer review
    //   (`rule.require.experience-catalog-evolution`, backward terminus).
    //
    // 🔴 sdk-config READS this field; it does not own or consume it. the 6
    //    ahbode consumers wrote `organization` for their own schemas years
    //    before this change, so what we take from it must also stay theirs.
    //
    // ⚠️ this is the one behavior no other test in the repo could catch: every
    //    other schema here OMITS `organization`, and a plain `z.object` strips
    //    unknown keys — so a build that deleted the field before `safeParse`
    //    would keep all 111 other tests green and break every consumer that
    //    reads its own org. the two `when`s clamp both directions.
    when('[t0] the consumer schema DECLARES it', () => {
      const schemaWithOrg = z.object({
        organization: z.string(),
        database: z.object({
          host: z.string(),
          port: z.number(),
          password: z.string(),
        }),
        api: z.object({ key: z.string(), url: z.string() }),
      });

      const getConfig = genGetConfig({
        schema: schemaWithOrg,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: testEnv,
      });

      const result = useBeforeAll(async () => getConfig());

      then('the field survives into the parsed config', () => {
        expect(result.organization).toEqual('test-org');
      });
    });

    when('[t1] the consumer schema OMITS it', () => {
      // .note = the mirror clamp, and it guards the cost F8 imposes: we now
      //         REQUIRE a key the consumer may never have declared in their
      //         own schema. a plain `z.object` strips it, so the requirement
      //         costs such a consumer no schema edit.
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [fakeParamSupplier, fakeSecretSupplier],
        environment: testEnv,
      });

      const result = useBeforeAll(async () => getConfig());

      then('the config still parses, with the key stripped', () => {
        expect(result.database.host).toEqual('localhost');
        expect(result).not.toHaveProperty('organization');
      });
    });
  });

  given('[case32] the repo has TWO declared sources, and no argument', () => {
    // 🔴 .note = `genGetConfig` takes NO `repo` key. both path segments are
    //         declared in the config, and the repo alone carries an ergonomic
    //         default because its name is already on disk.
    //
    //         | route | source |
    //         |---|---|
    //         | explicit | the config's `repository` field |
    //         | default | `package.json` `name`, scope stripped |
    //
    // ⛔ do NOT re-add a `repo` argument. a third source is what let
    //    `repo: 'ehmpathy/svc-x'` pre-supply an org the derive now supplies —
    //    five segments, no error (`rule.forbid.combinatorial-explosion`).
    const genFactoryFromDir = (input: { dir: string }) => {
      const paths: string[] = [];
      const getConfig = genGetConfig({
        schema: testSchema,
        statics: `${input.dir}/*.yml`,
        cache: createCache(),
        suppliers: [
          genNotedParamSupplier({ paths, verdict: 'supply' }),
          fakeSecretSupplier,
        ],
        environment: testEnv,
      });
      return { getConfig, paths };
    };

    when('[t0] the config declares `repository`', () => {
      const scene = useBeforeAll(async () => {
        const { getConfig, paths } = genFactoryFromDir({
          dir: TEST_CONFIG_DIR,
        });
        await getConfig();
        return { paths };
      });

      then('the declared value is the segment', () => {
        expect(scene.paths).toEqual([
          '/test-org/test-svc/test/database.password',
        ]);
      });
    });

    when('[t1] the config declares NO `repository`', () => {
      const scene = useBeforeAll(async () => {
        const { getConfig, paths } = genFactoryFromDir({
          dir: TEST_CONFIG_NOREPO_DIR,
        });
        await getConfig();
        return { paths };
      });

      then('package.json `name` is the ergonomic default', () => {
        // this repo's own package.json declares `name: "sdk-config"`
        expect(scene.paths).toEqual([
          '/test-org/sdk-config/test/database.password',
        ]);
      });
    });

    when('[t2] the declared `repository` carries an npm SCOPE', () => {
      const scene = useBeforeAll(async () => {
        const { getConfig, paths } = genFactoryFromDir({
          dir: TEST_CONFIG_SCOPEDREPO_DIR,
        });
        await getConfig();
        return { paths };
      });

      then('the scope is stripped, over spliced as a segment', () => {
        // 🔴 the clamp on the scope strip. spliced verbatim,
        //    `@ehmpathy/svc-x` derives `/test-org/@ehmpathy/svc-x/test/…` —
        //    five segments, and a path no param lives at. a scope names an
        //    ORG, and the org is already its own segment.
        expect(scene.paths).toEqual(['/test-org/svc-x/test/database.password']);
      });
    });

    when('[t3] the declared `repository` is whitespace only', () => {
      const scene = useBeforeAll(async () => ({
        error: await getError(async () => {
          const { getConfig } = genFactoryFromDir({
            dir: TEST_CONFIG_BADREPO_BLANK_DIR,
          });
          return getConfig();
        }),
      }));

      then('it throws, over a blank spliced segment', () => {
        // ⚠️ `'   '` is the one malformed value a `typeof` check cannot catch.
        //    drop the `.trim()` in `asRepoSegment` and this splices `/   /` —
        //    a name aws refuses, three files from the line that caused it.
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain('repo is empty');
      });

      then('the refusal is snapped at the surface a caller meets', () => {
        expect(
          asPortableMessage({ message: scene.error.message }),
        ).toMatchSnapshot();
      });
    });
  });
});
