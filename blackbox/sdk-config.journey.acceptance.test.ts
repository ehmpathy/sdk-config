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
  SdkConfigEnvironment,
} from '@src/index';

const TEST_CONFIG_DIR = join(__dirname, '../src/__test_assets__/config');

/**
 * developer config journey:
 * a developer configures an application with typed secrets
 *
 * .note = uses real AWS services
 */
describe('sdk-config.journey', () => {
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

  // paths for my-app repo
  const testPaths = {
    param: '/my-app/test/database.password',
    secret: '/shared/api/key',
  };

  // setup: create AWS resources
  beforeAll(async () => {
    await ssmClient.send(new PutParameterCommand({
      Name: testPaths.param,
      Value: testParamValue,
      Type: 'String',
      Overwrite: true,
    }));

    try {
      await secretsClient.send(new CreateSecretCommand({
        Name: testPaths.secret,
        SecretString: testSecretValue,
      }));
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.name === 'ResourceExistsException') {
        // secret exists, read its current value (IAM may not allow write)
        const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
        const response = await secretsClient.send(new GetSecretValueCommand({
          SecretId: testPaths.secret,
        }));
        testSecretValue = response.SecretString ?? '';
      } else if (error.name === 'InvalidRequestException' && error.message.includes('scheduled for deletion')) {
        // secret was scheduled for deletion by a prior test run
        // wait a few minutes for AWS to complete the delete, then re-run tests
        throw new ConstraintError(`secret ${testPaths.secret} is scheduled for deletion`, {
          hint: 'wait a few minutes for AWS to complete the delete, then re-run tests',
          cause: error,
        });
      } else {
        throw error;
      }
    }
  });

  // teardown: clean up SSM params only
  // .note = secrets are NOT deleted to avoid "scheduled for deletion" conflicts
  //         between test files. secrets are overwritten on subsequent runs.
  afterAll(async () => {
    await ssmClient.send(new DeleteParameterCommand({ Name: testPaths.param })).catch(() => {});
  });

  // developer defines their config schema
  const appSchema = z.object({
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

  given('[journey] developer configures application with typed secrets', () => {
    // step 1: config file already exists (test.yml in fixtures)

    when('[t0] genGetConfig is called with schema and suppliers', () => {
      const cache = createCache();
      const getConfig = genGetConfig({
        schema: appSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache,
        suppliers: [paramSupplier, secretSupplier],
        environment: testEnv,
        repoName: 'my-app',
      });

      then('returns a function with .static() and .filled() methods', () => {
        expect(typeof getConfig).toBe('function');
        expect(typeof getConfig.static).toBe('function');
        expect(typeof getConfig.filled).toBe('function');
        expect(Object.keys(getConfig).sort()).toMatchSnapshot();
      });

      when('[t1] getConfig.static() is called', () => {
        then('raw config with placeholders is returned', () => {
          const raw = getConfig.static();
          expect(raw).toMatchSnapshot();
          expect(raw.database).toMatchObject({
            host: 'localhost',
            password: expect.stringContaining('$.at('),
          });
        });
      });

      when('[t2] getConfig() fills secrets from real AWS', () => {
        const result = useBeforeAll(async () => getConfig());

        then('typed config with filled secrets is returned', () => {
          expect(result.database.password).toBe(testParamValue);
          expect(result.api.key).toBe(testSecretValue);
        });
      });

      when('[t3] getConfig() is called again', () => {
        const secondResult = useBeforeAll(async () => getConfig());

        then('same result from cache', async () => {
          const thirdResult = await getConfig();
          expect(thirdResult.database.password).toBe(secondResult.database.password);
          expect(thirdResult.api.key).toBe(secondResult.api.key);
        });
      });
    });

    when('[t4] schema validation fails', () => {
      const badSchema = z.object({
        database: z.object({
          host: z.string(),
          port: z.number(),
          password: z.string(),
          nonexistent: z.string(), // not in config
        }),
      });

      const getConfig = genGetConfig({
        schema: badSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [paramSupplier, secretSupplier],
        environment: testEnv,
        repoName: 'my-app',
      });

      then('helpful error is thrown with schema context', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toMatchSnapshot();
        expect(error.message).toContain('config validation failed');
      });
    });

    when('[t5] unknown scheme in config', () => {
      const getConfig = genGetConfig({
        schema: appSchema,
        statics: `${TEST_CONFIG_DIR}/*.yml`,
        cache: createCache(),
        suppliers: [], // no suppliers
        environment: testEnv,
        repoName: 'my-app',
      });

      then('helpful error is thrown with scheme context', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toMatchSnapshot();
        expect(error.message).toContain('unknown scheme');
      });
    });
  });
});
