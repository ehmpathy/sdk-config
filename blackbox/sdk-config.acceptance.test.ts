import {
  DeleteParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { join } from 'path';

import { BadRequestError, ConstraintError, getError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';
import { getUuid } from 'uuid-fns';
import { z } from 'zod';

import {
  genGetConfig,
  genSdkConfigSupplierAwsParameterStore,
  genSdkConfigSupplierAwsSecretsManager,
  type SdkConfigSupplier,
  SdkConfigEnvironment,
  SupplyAbsentError,
  SupplyDeniedError,
  SupplyError,
} from '@src/index';

const TEST_CONFIG_DIR = join(__dirname, '../src/__test_assets__/config');

/**
 * .what = real AWS acceptance tests for sdk-config
 * .why = verify full end-to-end flow with actual AWS services
 *
 * .note = requires AWS credentials with SSM and Secrets Manager access
 */
describe('sdk-config', () => {
  const hasAwsCredentials = (): boolean => {
    return !!(
      process.env.AWS_PROFILE ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_SESSION_TOKEN
    );
  };

  // check credentials at describe level
  if (!hasAwsCredentials()) {
    throw new ConstraintError('AWS credentials required for acceptance tests', {
      hint: 'set AWS_PROFILE or AWS credentials via keyrack',
    });
  }

  // real AWS clients and suppliers
  const ssmClient = new SSMClient({ region: 'us-east-1' });
  const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });
  const paramSupplier = genSdkConfigSupplierAwsParameterStore({ client: ssmClient });
  const secretSupplier = genSdkConfigSupplierAwsSecretsManager({ client: secretsClient });

  // unique test values to verify real resolution
  const testUuid = getUuid();
  const testParamValue = `test-param-${testUuid}`;
  let testSecretValue = `test-secret-${testUuid}`;

  // paths that match the test config files ($.at resolves these)
  // .note = auto-derived paths use dots for keyPath: /{repoName}/{access}/{keyPath}
  const testPaths = {
    paramTestAcceptance: '/acceptance-test-svc/test/database.password',
    paramPrepAcceptance: '/acceptance-test-svc/prep/database.password',
    paramProdAcceptance: '/acceptance-test-svc/prod/database.password',
    paramTestSdkConfig: '/sdk-config/test/database.password',
    secretShared: '/shared/api/key', // explicit path from $.at(aws::secret/shared/api/key)
    secretProdAcceptance: '/acceptance-test-svc/prod/api.key', // auto-derived from $.at(aws::secret)
  };

  // setup: create all AWS resources
  beforeAll(async () => {
    // create SSM params
    await Promise.all([
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramTestAcceptance,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramPrepAcceptance,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramProdAcceptance,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramTestSdkConfig,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
    ]);

    // create Secrets (need try-catch for create-or-read pattern)
    for (const secretPath of [testPaths.secretShared, testPaths.secretProdAcceptance]) {
      try {
        await secretsClient.send(new CreateSecretCommand({
          Name: secretPath,
          SecretString: testSecretValue,
        }));
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.name === 'ResourceExistsException') {
          // secret exists, read its current value (IAM may not allow write)
          const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
          const response = await secretsClient.send(new GetSecretValueCommand({
            SecretId: secretPath,
          }));
          testSecretValue = response.SecretString ?? '';
        } else if (error.name === 'InvalidRequestException' && error.message.includes('scheduled for deletion')) {
          // secret was scheduled for deletion by a prior test run
          // wait a few minutes for AWS to complete the delete, then re-run tests
          throw new ConstraintError(`secret ${secretPath} is scheduled for deletion`, {
            hint: 'wait a few minutes for AWS to complete the delete, then re-run tests',
            cause: error,
          });
        } else {
          throw error;
        }
      }
    }
  });

  // teardown: clean up SSM params only
  // .note = secrets are NOT deleted to avoid "scheduled for deletion" conflicts
  //         between test files. secrets are overwritten on subsequent runs.
  afterAll(async () => {
    await Promise.all([
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramTestAcceptance })),
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramPrepAcceptance })),
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramProdAcceptance })),
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramTestSdkConfig })),
    ].map(p => p.catch(() => {}))); // ignore errors on cleanup
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

  given('[case1] full flow with real AWS suppliers', () => {
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
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig() is called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('database password is resolved from real SSM', () => {
        expect(result.database.password).toEqual(testParamValue);
      });

      then('api key is resolved from real Secrets Manager', () => {
        expect(result.api.key).toEqual(testSecretValue);
      });

      then('static values are preserved', () => {
        expect(result.database.host).toEqual('localhost');
        expect(result.database.port).toEqual(5432);
        expect(result.api.url).toEqual('https://api.test.example.com');
      });
    });
  });

  given('[case2] static access without secrets', () => {
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
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig.static() is called', () => {
      then('raw config with placeholders matches snapshot', () => {
        const staticConfig = getConfig.static();
        expect(staticConfig).toMatchSnapshot();
      });
    });
  });

  given('[case3] schema mismatch in test env', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // does not exist in config
      }),
    });

    const getConfig = genGetConfig({
      schema: badSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig() is called', () => {
      then('error message matches snapshot', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case4] unknown scheme', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [], // no suppliers registered
      environment: testEnv,
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig() is called', () => {
      then('error message matches snapshot', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case5] schema mismatch in prod/cloud environment', () => {
    // .note = prod/cloud should warn but not crash per vision spec
    const prodCloudEnv = new SdkConfigEnvironment({
      config: 'prod',
      server: 'cloud@aws.lambda',
    });

    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // does not exist in config
      }),
    });

    const getConfig = genGetConfig({
      schema: badSchema,
      statics: `${TEST_CONFIG_DIR}/*.json5`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: prodCloudEnv,
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig() is called', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      then('config is returned despite mismatch', async () => {
        const result = await getConfig();
        expect(result).toBeDefined();
        expect(result.database.host).toBeDefined();
        expect(result.database.password).toEqual(testParamValue);
      });

      then('warn is logged', async () => {
        await getConfig();
        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0]?.[0]).toMatchSnapshot();
      });

      afterAll(() => {
        warnSpy.mockRestore();
      });
    });
  });

  given('[case6] prep environment failfast on schema mismatch', () => {
    const prepEnv = new SdkConfigEnvironment({
      config: 'prep',
      server: 'local@unix',
    });

    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // does not exist in config
      }),
    });

    const getConfig = genGetConfig({
      schema: badSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: prepEnv,
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig() is called', () => {
      then('error is thrown like test environment', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case7] repo name auto-derived from package.json', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    // .note = no repoName provided to test auto-derivation
    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,
      // repoName absent - should use package.json name
    });

    when('[t0] getConfig() is called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('database password is resolved from real SSM', () => {
        // package.json has name: "sdk-config", so path is /sdk-config/test/database/password
        expect(result.database.password).toEqual(testParamValue);
      });

      then('api key is resolved from real Secrets Manager', () => {
        expect(result.api.key).toEqual(testSecretValue);
      });
    });
  });

  given('[case8] config files not found', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    // .note = uses real suppliers but errors before they're called
    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.nonexistent`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,
      repoName: 'acceptance-test-svc',
    });

    // .note = the message echoes the caller's `statics` glob (an absolute
    //         __dirname-derived path). we redact the repo-root prefix (process.cwd())
    //         to `<cwd>` so the snapshot keeps its coverage yet stays portable.
    when('[t0] getConfig() is called', () => {
      then('throws BadRequestError with no files message', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(
          error.message.split(process.cwd()).join('<cwd>'),
        ).toMatchSnapshot();
      });
    });

    when('[t1] getConfig.static() is called', () => {
      then('throws BadRequestError with no files message', async () => {
        const error = await getError(async () => getConfig.static());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(
          error.message.split(process.cwd()).join('<cwd>'),
        ).toMatchSnapshot();
      });
    });
  });

  given('[case9] config slug not found', () => {
    const unknownConfigEnv = new SdkConfigEnvironment({
      config: 'nonexistent' as 'test',
      server: 'local@unix',
    });

    // .note = uses real suppliers but errors before they're called
    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: unknownConfigEnv,
      repoName: 'acceptance-test-svc',
    });

    // .note = the message lists the discovered config `files` as absolute
    //         __dirname-derived paths. we redact the repo-root prefix (process.cwd())
    //         to `<cwd>` so the snapshot keeps its coverage yet stays portable.
    when('[t0] getConfig() is called', () => {
      then('throws BadRequestError with config slug message', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('config file not found for choice');
        expect(
          error.message.split(process.cwd()).join('<cwd>'),
        ).toMatchSnapshot();
      });
    });
  });

  // the feature under test at the BUILT-ARTIFACT level: an optional field whose
  // supplier reports a TOLERABLE error (denied/absent) is omitted, not fatal; a
  // required field with the same error hard-throws with the denied path. real AWS
  // still fills database.password; a custom secret supplier (built from the public
  // SupplyDeniedError/SupplyAbsentError taxonomy exported from @src/index) reports
  // the tolerable error for api.key. this proves the tolerance contract holds for a
  // consumer of the published package, not just the in-source contract layer.
  const optionalApiSchema = z.object({
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

  const deniedSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => {
      throw new SupplyDeniedError('access denied to secret', { path });
    },
  };

  const absentSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => {
      throw new SupplyAbsentError('secret not found', { path });
    },
  };

  given('[case10] optional key denied — tolerated, key omitted', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: optionalApiSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, deniedSecretSupplier],
      environment: testEnv,
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig() is called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('the denied optional key is omitted', () => {
        expect(result.api.key).toBeUndefined();
      });

      then('the real param field is still filled from AWS', () => {
        expect(result.database.password).toEqual(testParamValue);
      });

      then('the resolved config matches snapshot', () => {
        // password is a per-run uuid — match its type, snapshot the rest concretely
        expect(result).toMatchSnapshot({
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case11] optional key absent — tolerated, key omitted', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: optionalApiSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, absentSecretSupplier],
      environment: testEnv,
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig() is called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('the absent optional key is omitted', () => {
        expect(result.api.key).toBeUndefined();
      });

      then('the resolved config matches snapshot', () => {
        expect(result).toMatchSnapshot({
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case12] required key denied — hard throw with denied path', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    // api.key is REQUIRED here (testSchema); a tolerable error on a required field
    // is still a hard failure — the denied path surfaces in context.
    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, deniedSecretSupplier],
      environment: testEnv,
      repoName: 'acceptance-test-svc',
    });

    when('[t0] getConfig() is called', () => {
      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then('throws BadRequestError that names the denied path', () => {
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain(
          'config requires values that could not be read',
        );
        expect(scene.error.message).toContain('api.key');

        // snapshot structured metadata, not the message string (which bakes the
        // cause's stack — absolute paths). mask the denial `cause` by type.
        const error = scene.error;
        if (!(error instanceof BadRequestError)) throw error;
        expect(error.metadata).toMatchSnapshot({
          blockers: [{ cause: expect.any(SupplyError) }],
        });
      });
    });
  });
});
