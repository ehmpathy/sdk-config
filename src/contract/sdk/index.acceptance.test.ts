/**
 * .what = acceptance tests for sdk-config public api
 * .why = verify end-to-end user journeys via contract exports
 *
 * .note = uses real AWS services
 */

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
import { BadRequestError, ConstraintError, getError } from 'helpful-errors';
import { join } from 'path';
import { given, then, useBeforeAll, when } from 'test-fns';
import { getUuid } from 'uuid-fns';
import { z } from 'zod';

import {
  genGetConfig,
  genSdkConfigSupplierAwsParameterStore,
  genSdkConfigSupplierAwsSecretsManager,
  SdkConfigEnvironment,
} from './index';

const TEST_CONFIG_DIR = join(__dirname, '../../__test_assets__/config');

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
  const paramSupplier = genSdkConfigSupplierAwsParameterStore({ client: ssmClient });
  const secretSupplier = genSdkConfigSupplierAwsSecretsManager({ client: secretsClient });

  // unique test values
  const testUuid = getUuid();
  const testParamValue = `test-param-${testUuid}`;
  let testSecretValue = `test-secret-${testUuid}`;

  // paths that match the test config files
  const testPaths = {
    paramTestSvc: '/test-svc/test/database.password',
    paramTestSvcProd: '/test-svc/prod/database.password',
    secretShared: '/shared/api/key',
    secretProdApiKey: '/test-svc/prod/api.key',
  };

  // setup: create AWS resources
  beforeAll(async () => {
    await Promise.all([
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramTestSvc,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramTestSvcProd,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
    ]);

    for (const secretPath of [testPaths.secretShared, testPaths.secretProdApiKey]) {
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
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramTestSvc })),
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramTestSvcProd })),
    ].map(p => p.catch(() => {})));
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
      access: 'test',
      server: 'local',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,
      repoName: 'test-svc',
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
    });
  });

  given('[case2] invalid schema in test environment', () => {
    const testEnv = new SdkConfigEnvironment({
      access: 'test',
      server: 'local',
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
      repoName: 'test-svc',
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
      access: 'test',
      server: 'local',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,
      repoName: 'test-svc',
    });

    when('[t0] getConfig.static() called', () => {
      then('returns raw config with placeholders', () => {
        const staticConfig = getConfig.static();
        expect(staticConfig).toMatchSnapshot();
      });

      then('placeholders are not resolved', () => {
        const staticConfig = getConfig.static() as z.infer<typeof testSchema>;
        expect(staticConfig.database.password).toEqual('$.at(aws::param)');
      });
    });
  });

  given('[case4] environment selection by access', () => {
    const prodEnv = new SdkConfigEnvironment({
      access: 'prod',
      server: 'cloud',
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*`, // includes both yml and json5
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: prodEnv,
      repoName: 'test-svc',
    });

    when('[t0] getConfig() called with prod access', () => {
      const result = useBeforeAll(async () => getConfig());

      then('selects prod config file', () => {
        expect(result.database.host).toEqual('db.prod.example.com');
      });

      then('secrets are filled from real AWS', () => {
        warnSpy.mockRestore();
        expect(result.database.password).toEqual(testParamValue);
        expect(result.api.key).toEqual(testSecretValue);
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
      then('accepts valid access/server combinations', () => {
        const testLocal = new SdkConfigEnvironment({
          access: 'test',
          server: 'local',
        });
        expect(testLocal.access).toEqual('test');
        expect(testLocal.server).toEqual('local');

        const prodCloud = new SdkConfigEnvironment({
          access: 'prod',
          server: 'cloud',
        });
        expect(prodCloud.access).toEqual('prod');
        expect(prodCloud.server).toEqual('cloud');
      });

      then('environment shape matches snapshot', () => {
        const env = new SdkConfigEnvironment({
          access: 'test',
          server: 'local',
        });
        expect(env).toMatchSnapshot();
      });
    });
  });
});
