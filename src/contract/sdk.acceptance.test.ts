/**
 * .what = acceptance tests for the sdk-config public api
 * .why = verify end-to-end user journeys through the package entrypoint
 *
 * .note = uses real AWS services
 *
 * .note = it sits BESIDE `sdk.ts`, the one file that declares the public
 *         surface, and imports through it rather than reaching into `src/`.
 *         ⇒ a suite that grades a contract belongs beside the contract, and it
 *           must see exactly what a consumer sees.
 */

import {
  CreateSecretCommand,
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import {
  DeleteParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { BadRequestError, ConstraintError, getError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';
import { getUuid } from 'uuid-fns';
import { z } from 'zod';

import { join } from 'node:path';
import {
  genGetConfig,
  genSdkConfigSupplierAwsParameterStore,
  genSdkConfigSupplierAwsSecretsManager,
  SdkConfigEnvironment,
  type SdkConfigSupplier,
  SupplyDeniedError,
  SupplyError,
} from './sdk';

const TEST_CONFIG_DIR = join(__dirname, '../.test/assets/config');
const TEST_CONFIG_OPTIONAL_DIR = join(
  __dirname,
  '../.test/assets/config-optional',
);
const TEST_CONFIG_CICD_DIR = join(__dirname, '../.test/assets/config-cicd');

describe('sdk-config', () => {
  const hasAwsCredentials = (): boolean => {
    return !!(
      process.env.AWS_PROFILE ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_SESSION_TOKEN
    );
  };

  if (!hasAwsCredentials()) {
    throw new ConstraintError('AWS credentials required for acceptance tests', {
      hint: 'set AWS_PROFILE or AWS credentials via keyrack',
    });
  }

  // real AWS clients and suppliers
  const ssmClient = new SSMClient({ region: 'us-east-1' });
  const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });
  const paramSupplier = genSdkConfigSupplierAwsParameterStore({
    client: ssmClient,
  });
  const secretSupplier = genSdkConfigSupplierAwsSecretsManager({
    client: secretsClient,
  });

  // unique test values
  const testUuid = getUuid();
  const testParamValue = `test-param-${testUuid}`;
  // .note = deliberate mutation — the secret may already exist in AWS (IAM may
  //         deny write), so setup reads back its actual value for assertions.
  let testSecretValue = `test-secret-${testUuid}`;

  // paths that match the test config files
  // .note = a derived path carries FOUR segments — /{org}/{repo}/{choice}/{keyPath}.
  //         `test-org` is the `organization` the fixtures under .test/assets declare.
  //         secretShared stays three: it is an EXPLICIT path, which the derive never touches.
  const testPaths = {
    paramTestSvc: '/test-org/test-svc/test/database.password',
    paramTestSvcProd: '/test-org/test-svc/prod/database.password',
    secretShared: '/shared/api/key',
    secretProdApiKey: '/test-org/test-svc/prod/api.key',
  };

  // the 4 auto-derived params for the cicd grant-escalation config
  // (org=test-org, repo=test-svc, config=test, nested under each grant dir)
  const cicdParamPaths = [
    '/test-org/test-svc/test/role.cicd.plan.username',
    '/test-org/test-svc/test/role.cicd.plan.password',
    '/test-org/test-svc/test/role.cicd.apply.username',
    '/test-org/test-svc/test/role.cicd.apply.password',
  ];

  // setup: create AWS resources
  beforeAll(async () => {
    await Promise.all([
      ssmClient.send(
        new PutParameterCommand({
          Name: testPaths.paramTestSvc,
          Value: testParamValue,
          Type: 'String',
          Overwrite: true,
        }),
      ),
      ssmClient.send(
        new PutParameterCommand({
          Name: testPaths.paramTestSvcProd,
          Value: testParamValue,
          Type: 'String',
          Overwrite: true,
        }),
      ),
      // the 4 cicd grant-escalation params (both grants present in AWS; the
      // per-job denial is modeled by a grant-scoped supplier, not by absence)
      ...cicdParamPaths.map((path) =>
        ssmClient.send(
          new PutParameterCommand({
            Name: path,
            Value: testParamValue,
            Type: 'String',
            Overwrite: true,
          }),
        ),
      ),
    ]);

    for (const secretPath of [
      testPaths.secretShared,
      testPaths.secretProdApiKey,
    ]) {
      try {
        await secretsClient.send(
          new CreateSecretCommand({
            Name: secretPath,
            SecretString: testSecretValue,
          }),
        );
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        // a prior run scheduled it for deletion — cannot proceed until AWS finishes
        if (
          error.name === 'InvalidRequestException' &&
          error.message.includes('scheduled for deletion')
        )
          throw new ConstraintError(
            `secret ${secretPath} is scheduled for deletion`,
            {
              hint: 'wait a few minutes for AWS to complete the delete, then re-run tests',
              cause: error,
            },
          );

        // any error other than already-exists is a real failure
        if (error.name !== 'ResourceExistsException') throw error;

        // secret exists — read its current value (IAM may not allow write)
        const response = await secretsClient.send(
          new GetSecretValueCommand({ SecretId: secretPath }),
        );
        testSecretValue = response.SecretString ?? '';
      }
    }
  });

  // teardown: clean up SSM params only
  // .note = secrets are NOT deleted to avoid "scheduled for deletion" conflicts
  //         between test files. secrets are overwritten on subsequent runs.
  afterAll(async () => {
    await Promise.all(
      [
        ssmClient.send(
          new DeleteParameterCommand({ Name: testPaths.paramTestSvc }),
        ),
        ssmClient.send(
          new DeleteParameterCommand({ Name: testPaths.paramTestSvcProd }),
        ),
        ...cicdParamPaths.map((path) =>
          ssmClient.send(new DeleteParameterCommand({ Name: path })),
        ),
      ].map((p) => p.catch(() => {})),
    );
  });

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

  const createCache = () => {
    const store = new Map<string, unknown>();
    return {
      get: <T>(key: string) => store.get(key) as T | undefined,
      set: <T>(key: string, val: T) => {
        store.set(key, val);
      },
    };
  };

  given('[case1] yaml config with placeholders', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,
    });

    when('[t0] genGetConfig called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('secrets are filled from real AWS', () => {
        expect(result.database.password).toEqual(testParamValue);
        expect(result.api.key).toEqual(testSecretValue);
      });

      then('static values are preserved', () => {
        expect(result.database.host).toEqual('localhost');
        expect(result.database.port).toEqual(5432);
      });

      // 🔴 the POSITIVE journey, SNAPPED — `r4 blocker.1` (i002), conceded.
      //    the two `then` blocks above prove each value is CORRECT, one key at
      //    a time; only a snapshot proves the whole FILLED SHAPE a caller
      //    receives through the public surface, and a reviewer sees it in the
      //    PR diff without a run.
      //
      //    both filled values carry a per-run uuid, so both are MASKED and the
      //    rest is snapped live — never carved out
      //    (`rule.require.contract-snapshot-exhaustiveness`).
      //
      //    ⇒ `organization` is absent from the snap on purpose: the fixture
      //      config declares it and `testSchema` does not, so zod strips it at
      //      the parse. that is the [case9] experience, pinned at the one
      //      surface a consumer actually imports.
      then('and the FILLED SHAPE a caller receives is pinned, masked', () => {
        expect(result).toMatchSnapshot({
          api: { key: expect.any(String) },
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case2] invalid schema in test environment', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // field that does not exist
      }),
    });

    const getConfig = genGetConfig({
      schema: badSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,
    });

    when('[t0] getConfig called', () => {
      then('throws helpful error with details', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('config validation failed');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case3] static config access', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,
    });

    when('[t0] getConfig.static() called', () => {
      then('returns raw config with placeholders', () => {
        const staticConfig = getConfig.static();

        // 🔴 a companion assertion, so the snapshot validates a STATED claim
        //    over whatever the code last emitted (`rule.forbid.failhide`).
        //
        // .note = the next `then` already asserts the placeholders are
        //         unresolved, so this one asserts the other half of the case's
        //         claim: the org field survives a raw read intact.
        expect(staticConfig.organization).toEqual('test-org');

        expect(staticConfig).toMatchSnapshot();
      });

      then('placeholders are not resolved', () => {
        const staticConfig = getConfig.static() as z.infer<typeof testSchema>;
        expect(staticConfig.database.password).toEqual('$.at(aws::param)');
      });
    });
  });

  given('[case4] environment selection by access', () => {
    // ⛔ do NOT reintroduce a `jest.spyOn(console, 'warn').mockImplementation()`
    //    here. one stood at this spot and was removed — `r9 blocker.1`,
    //    conceded. two defects, and the second is the one that bites:
    //
    //    1. `rule.forbid.acceptance.mocks` grades an undocumented mock in a
    //       `.acceptance.test.ts` a BLOCKER, and this one carried no
    //       `.mock`/`.why` exception record — because there was no exception
    //       to record. it asserted naught; it only muted output.
    //
    //    2. 🔴 its `mockRestore()` sat inside a `then`, so the restore ran
    //       only if THAT assertion executed. a failure in the peer `then`
    //       above it left `console.warn` mocked for the REST OF THE SUITE —
    //       every later warn swallowed, silently, exactly when a failure
    //       makes warnings most worth a read.
    //
    // ⇒ the fix is a deletion, not a relocation. a warn printed by this case
    //   is noise a human can read; a warn swallowed by a leaked spy is a
    //   signal nobody can recover. and the prod/cloud warn is deliberately
    //   snapped elsewhere (`blackbox/sdk-config.acceptance.test.ts [case5]`),
    //   so a mute here would have hidden output another case asserts.
    const prodEnv = new SdkConfigEnvironment({
      config: 'prod',
      server: 'cloud@aws.lambda',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*`, // includes both yml and json5
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: prodEnv,
    });

    when('[t0] getConfig() called with prod access', () => {
      const result = useBeforeAll(async () => getConfig());

      then('selects prod config file', () => {
        expect(result.database.host).toEqual('db.prod.example.com');
      });

      then('secrets are filled from real AWS', () => {
        expect(result.database.password).toEqual(testParamValue);
        expect(result.api.key).toEqual(testSecretValue);
      });

      // 🔴 the PROD-SELECTION journey, SNAPPED — `r10 blocker.1` (i006), conceded.
      //    the peer variant of [case1]: same output CLASS — the filled config a
      //    caller receives — under the other environment. [case1] was masked
      //    and snapped at this surface; this one was left asserted-only, so the
      //    prod path's shape was invisible in a PR diff
      //    (`rule.require.contract-snapshot-exhaustiveness`).
      //
      //    both filled values carry the same per-run uuid the two `then` blocks
      //    above assert, so both are MASKED and the rest is snapped live — never
      //    carved out.
      //
      //    ⇒ what the snap pins that no `toEqual` above can: the SELECTION. the
      //      statics glob is `/*`, so it sees `test.yml` AND `prod.json5`; only
      //      the whole shape shows that `api.url` came from the prod file too,
      //      rather than one key that matches by coincidence.
      then('and the FILLED SHAPE a caller receives is pinned, masked', () => {
        expect(result).toMatchSnapshot({
          api: { key: expect.any(String) },
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case5] supplier factories export correctly', () => {
    when('[t0] supplier factories are called', () => {
      then('genSdkConfigSupplierAwsParameterStore returns supplier', () => {
        const supplier = genSdkConfigSupplierAwsParameterStore();
        expect(supplier.scheme).toEqual('aws::param');
        expect(typeof supplier.supply).toEqual('function');
      });

      then('genSdkConfigSupplierAwsSecretsManager returns supplier', () => {
        const supplier = genSdkConfigSupplierAwsSecretsManager();
        expect(supplier.scheme).toEqual('aws::secret');
        expect(typeof supplier.supply).toEqual('function');
      });

      then('supplier shape matches snapshot', () => {
        const paramSupplier = genSdkConfigSupplierAwsParameterStore();
        const secretSupplier = genSdkConfigSupplierAwsSecretsManager();
        expect({
          paramSupplierKeys: Object.keys(paramSupplier).sort(),
          paramSupplierScheme: paramSupplier.scheme,
          secretSupplierKeys: Object.keys(secretSupplier).sort(),
          secretSupplierScheme: secretSupplier.scheme,
        }).toMatchSnapshot();
      });
    });
  });

  given('[case6] SdkConfigEnvironment export', () => {
    when('[t0] environment is constructed', () => {
      then('accepts valid config/server combinations', () => {
        const testLocal = new SdkConfigEnvironment({
          config: 'test',
          server: 'local@unix',
        });
        expect(testLocal.config).toEqual('test');
        expect(testLocal.server).toEqual('local@unix');

        const prodCloud = new SdkConfigEnvironment({
          config: 'prod',
          server: 'cloud@aws.lambda',
        });
        expect(prodCloud.config).toEqual('prod');
        expect(prodCloud.server).toEqual('cloud@aws.lambda');
      });

      then('environment shape matches snapshot', () => {
        const env = new SdkConfigEnvironment({
          config: 'test',
          server: 'local@unix',
        });
        expect(env).toMatchSnapshot();
      });
    });
  });

  given('[case7] optional key whose secret is absent in AWS', () => {
    // api.key points at a secret path that does not exist in AWS,
    // and the schema marks api.key optional
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

    const getConfig = genGetConfig({
      schema: schemaOptionalKey,
      statics: `${TEST_CONFIG_OPTIONAL_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: new SdkConfigEnvironment({
        config: 'test',
        server: 'local@unix',
      }),
    });

    when('[t0] getConfig() is called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('resolves with the absent optional key omitted', () => {
        expect(result.api.key).toBeUndefined();
      });

      then('the readable fields are still filled from real AWS', () => {
        expect(result.database.password).toEqual(testParamValue);
        expect(result.api.url).toEqual('https://api.test.example.com');
      });

      then('the resolved config matches snapshot', () => {
        // database.password is a fresh uuid per run — match by type, snap the rest
        expect(result).toMatchSnapshot({
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case8] required key whose secret is absent in AWS', () => {
    // same config, but api.key is required — an unreadable required field
    // must be a hard failure
    const schemaRequiredKey = z.object({
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

    const getConfig = genGetConfig({
      schema: schemaRequiredKey,
      statics: `${TEST_CONFIG_OPTIONAL_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: new SdkConfigEnvironment({
        config: 'test',
        server: 'local@unix',
      }),
    });

    when('[t0] getConfig() is called', () => {
      then('throws a hard failure with the denied path', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain(
          'config requires values that could not be read',
        );
        expect(error.message).toContain('api.key');

        // snapshot structured metadata, not the message string (which bakes each
        // cause's stack — absolute paths). mask the denial `cause` by type.
        if (!(error instanceof BadRequestError)) throw error;
        expect(error.metadata).toMatchSnapshot({
          blockers: [{ cause: expect.any(SupplyError) }],
        });
      });
    });
  });

  given(
    '[case9] absent required leaf under an optional ancestor — hard-throws',
    () => {
      // contract narrowed (no-walk design): api is .optional() but its leaf
      // api.key is REQUIRED and absent in AWS. a present api object (url read)
      // with a required-undefined key does not conform, and we do not delete the
      // whole api node to force it (that would silently drop the readable url).
      // so it hard-throws. to tolerate, mark the LEAF optional (see case11).
      const schemaOptionalAncestor = z.object({
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

      const getConfig = genGetConfig({
        schema: schemaOptionalAncestor,
        statics: `${TEST_CONFIG_OPTIONAL_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [paramSupplier, secretSupplier],
        environment: new SdkConfigEnvironment({
          config: 'test',
          server: 'local@unix',
        }),
      });

      when('[t0] getConfig() is called', () => {
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
          },
        );

        then('the hard-throw metadata matches snapshot', () => {
          // snapshot structured metadata, mask the denial `cause` by type
          const error = scene.error;
          if (!(error instanceof BadRequestError)) throw error;
          expect(error.metadata).toMatchSnapshot({
            blockers: [{ cause: expect.any(SupplyError) }],
          });
        });
      });
    },
  );

  given('[case10] absent nullable-only key — hard-throws', () => {
    // contract narrowed (no-walk design): api.key is .nullable() only — it
    // rejects undefined and only accepts null. an unreadable value is undefined
    // (we never observed a value; null is a value we did not see and will not
    // fabricate). so an absent nullable-only field does not conform and
    // hard-throws. to tolerate absence, mark it .nullish() (see case11).
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

    const getConfig = genGetConfig({
      schema: schemaNullableKey,
      statics: `${TEST_CONFIG_OPTIONAL_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: new SdkConfigEnvironment({
        config: 'test',
        server: 'local@unix',
      }),
    });

    when('[t0] getConfig() is called', () => {
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
        },
      );

      then('the hard-throw metadata matches snapshot', () => {
        // snapshot structured metadata, mask the denial `cause` by type
        const error = scene.error;
        if (!(error instanceof BadRequestError)) throw error;
        expect(error.metadata).toMatchSnapshot({
          blockers: [{ cause: expect.any(SupplyError) }],
        });
      });
    });
  });

  given(
    '[case11] nullish field whose secret is absent — omitted (undefined tolerated)',
    () => {
      // api.key is .nullish() — it accepts absence, so tolerance omits it.
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

      const getConfig = genGetConfig({
        schema: schemaNullishKey,
        statics: `${TEST_CONFIG_OPTIONAL_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [paramSupplier, secretSupplier],
        environment: new SdkConfigEnvironment({
          config: 'test',
          server: 'local@unix',
        }),
      });

      when('[t0] getConfig() is called', () => {
        const result = useBeforeAll(async () => getConfig());

        then('the nullish key is omitted (undefined)', () => {
          expect(result.api.key).toBeUndefined();
        });

        then('the readable fields are still filled', () => {
          expect(result.api.url).toEqual('https://api.test.example.com');
        });

        then('the resolved config matches snapshot', () => {
          expect(result).toMatchSnapshot({
            database: { password: expect.any(String) },
          });
        });
      });
    },
  );

  given(
    '[case12] optional field with a default whose secret is absent — default applies',
    () => {
      // api.key is explicitly optional with a default — an absent value is
      // tolerated and the schema default fills it.
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

      const getConfig = genGetConfig({
        schema: schemaDefaultKey,
        statics: `${TEST_CONFIG_OPTIONAL_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [paramSupplier, secretSupplier],
        environment: new SdkConfigEnvironment({
          config: 'test',
          server: 'local@unix',
        }),
      });

      when('[t0] getConfig() is called', () => {
        const result = useBeforeAll(async () => getConfig());

        then('the schema default fills the absent key', () => {
          expect(result.api.key).toEqual('fallback-key');
        });

        then('the readable fields are still filled', () => {
          expect(result.api.url).toEqual('https://api.test.example.com');
        });

        then('the resolved config matches snapshot', () => {
          expect(result).toMatchSnapshot({
            database: { password: expect.any(String) },
          });
        });
      });
    },
  );

  given(
    '[case13] a custom supplier opts into tolerance via the public SupplyDeniedError',
    () => {
      // proves the tolerable-error taxonomy is reachable from the public surface:
      // a third-party supplier (not the aws ones) throws the exported
      // SupplyDeniedError, and getConfig tolerates the optional field the same way.
      const customDeniedSupplier: SdkConfigSupplier = {
        scheme: 'aws::secret',
        supply: async ({ path }) => {
          throw new SupplyDeniedError('custom supplier denied this path', {
            path,
          });
        },
      };

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

      const getConfig = genGetConfig({
        schema: schemaOptionalKey,
        statics: `${TEST_CONFIG_OPTIONAL_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [paramSupplier, customDeniedSupplier],
        environment: new SdkConfigEnvironment({
          config: 'test',
          server: 'local@unix',
        }),
      });

      when('[t0] getConfig() is called', () => {
        const result = useBeforeAll(async () => getConfig());

        then('the denied optional key is omitted', () => {
          expect(result.api.key).toBeUndefined();
        });

        then(
          'the readable database field is still filled from real AWS',
          () => {
            expect(result.database.password).toEqual(testParamValue);
          },
        );

        then('the resolved config matches snapshot', () => {
          expect(result).toMatchSnapshot({
            database: { password: expect.any(String) },
          });
        });
      });
    },
  );

  given(
    '[case14] cicd grant escalation — one shared config, per-job grant, real AWS',
    () => {
      // `apply` is a privilege ESCALATION over `plan`: plan is the baseline grant
      // (readable by BOTH jobs), apply is the escalation (readable ONLY by the
      // apply job). all 4 params exist in real AWS; the per-job IAM scope is
      // modeled by a grant-scoped supplier that wraps the real paramSupplier and
      // throws SupplyDeniedError for the paths a given job's role cannot read.
      const genCicdSchema = (grant: 'plan' | 'apply') =>
        z.object({
          role: z.object({
            cicd: z.object({
              plan: z.object({
                username: z.string(),
                password: z.string(),
              }),
              apply: z.object({
                username:
                  grant === 'apply' ? z.string() : z.string().optional(),
                password:
                  grant === 'apply' ? z.string() : z.string().optional(),
              }),
            }),
          }),
        });

      // wrap the REAL aws param supplier: deny paths that contain the denied
      // token (an oidc-scoped IAM policy), read the rest from real AWS. `null`
      // denies none — the apply job's superset grant.
      const genGrantScopedSupplier = (
        deniedToken: string | null,
      ): SdkConfigSupplier => ({
        scheme: 'aws::param',
        supply: async ({ path }) => {
          if (deniedToken && path.includes(deniedToken))
            throw new SupplyDeniedError('denied outside oidc grant', { path });
          return paramSupplier.supply({ path });
        },
      });

      const genCicdGetConfig = (
        grant: 'plan' | 'apply',
        deniedToken: string | null,
      ) =>
        genGetConfig({
          schema: genCicdSchema(grant),
          statics: `${TEST_CONFIG_CICD_DIR}/*.yml`,
          cache: createCache(),
          suppliers: [genGrantScopedSupplier(deniedToken)],
          environment: new SdkConfigEnvironment({
            config: 'test',
            server: 'local@unix',
          }),
        });

      when('[t0] the plan job runs (GRANT=plan, denied on apply)', () => {
        const result = useBeforeAll(async () =>
          genCicdGetConfig('plan', 'apply')(),
        );

        then('the baseline plan fields are read from real AWS', () => {
          expect(result.role.cicd.plan.username).toEqual(testParamValue);
          expect(result.role.cicd.plan.password).toEqual(testParamValue);
        });

        then('the denied escalated apply fields are omitted', () => {
          expect(result.role.cicd.apply.username).toBeUndefined();
          expect(result.role.cicd.apply.password).toBeUndefined();
        });

        then('the resolved plan-job config matches snapshot', () => {
          expect(result).toMatchSnapshot({
            role: {
              cicd: {
                plan: {
                  username: expect.any(String),
                  password: expect.any(String),
                },
              },
            },
          });
        });
      });

      when('[t1] the apply job runs (GRANT=apply, superset grant)', () => {
        const result = useBeforeAll(async () =>
          genCicdGetConfig('apply', null)(),
        );

        then('both grants are fully read from real AWS', () => {
          expect(result.role.cicd.plan.password).toEqual(testParamValue);
          expect(result.role.cicd.apply.password).toEqual(testParamValue);
        });

        then('the resolved apply-job config matches snapshot', () => {
          expect(result).toMatchSnapshot({
            role: {
              cicd: {
                plan: {
                  username: expect.any(String),
                  password: expect.any(String),
                },
                apply: {
                  username: expect.any(String),
                  password: expect.any(String),
                },
              },
            },
          });
        });
      });

      when('[t2] boundary: plan job denied on the baseline plan grant', () => {
        // the baseline must always be readable — a denial there is fatal for
        // either job (plan.* is never optional).
        const scene = useBeforeAll(async () => ({
          error: await getError(genCicdGetConfig('plan', 'plan')()),
        }));

        then('getConfig hard-throws', () => {
          expect(scene.error).toBeInstanceOf(BadRequestError);
          expect(scene.error.message).toContain('could not be read');
        });

        then('the hard-throw metadata matches snapshot', () => {
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

      when(
        '[t3] boundary: apply job denied on its required escalated grant',
        () => {
          // for the apply job the escalated apply.* is REQUIRED — a denial is fatal
          // (unlike the plan job, which marks apply.* optional).
          const scene = useBeforeAll(async () => ({
            error: await getError(genCicdGetConfig('apply', 'apply')()),
          }));

          then('getConfig hard-throws', () => {
            expect(scene.error).toBeInstanceOf(BadRequestError);
            expect(scene.error.message).toContain('could not be read');
          });

          then('the hard-throw metadata matches snapshot', () => {
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
        },
      );
    },
  );

  given(
    '[case15] transient error on an optional field — never masked, through the public api',
    () => {
      // mirrors the unit-level invariant (genGetConfig.test.ts case24) at the
      // contract layer: a custom supplier throws a plain Error (transient, NOT a
      // SupplyError), the field is marked optional, and getConfig() still
      // hard-throws through the public surface. only absent/denied is tolerable;
      // a throttle/network error is never swallowed by optionality.
      const transientSecretSupplier: SdkConfigSupplier = {
        scheme: 'aws::secret',
        supply: async () => {
          throw new Error('network timeout: transient failure');
        },
      };

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

      const getConfig = genGetConfig({
        schema: schemaOptionalKey,
        statics: `${TEST_CONFIG_OPTIONAL_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [paramSupplier, transientSecretSupplier],
        environment: new SdkConfigEnvironment({
          config: 'test',
          server: 'local@unix',
        }),
      });

      when('[t0] getConfig() is called', () => {
        then('the transient error propagates (not tolerated)', async () => {
          const error = await getError(async () => getConfig());
          expect(error.message).toContain('network timeout');

          // the transient error is a plain Error with a deterministic message
          // (no metadata, no baked stack) — snapshot it to guard format drift,
          // the same way the other negative-path cases lock their error shape.
          expect(error.message).toMatchSnapshot();
        });
      });
    },
  );
});
