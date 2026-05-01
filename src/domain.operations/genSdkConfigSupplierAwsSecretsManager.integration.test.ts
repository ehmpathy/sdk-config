import {
  CreateSecretCommand,
  DeleteSecretCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { ConstraintError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';
import { getUuid } from 'uuid-fns';

import { genSdkConfigSupplierAwsSecretsManager } from './genSdkConfigSupplierAwsSecretsManager';

/**
 * .what = real integration tests for AWS Secrets Manager supplier
 * .why = verify actual aws integration works, not just mocked behavior
 *
 * .note = requires AWS credentials with Secrets Manager read/write access
 *         tests create and clean up their own resources
 */
describe('genSdkConfigSupplierAwsSecretsManager.integration', () => {
  const hasAwsCredentials = (): boolean => {
    return !!(
      process.env.AWS_PROFILE ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_SESSION_TOKEN
    );
  };

  given('[case1] real AWS Secrets Manager secret', () => {
    if (!hasAwsCredentials()) {
      throw new ConstraintError('AWS credentials required for integration test', {
        hint: 'set AWS_PROFILE or AWS credentials via keyrack',
      });
    }

    const client = new SecretsManagerClient({ region: 'us-east-1' });
    const supplier = genSdkConfigSupplierAwsSecretsManager({ client });
    const testPath = `ehmpathy/test/sdk-config/integration-test-${getUuid()}`;
    const testValue = `test-secret-${getUuid()}`;

    // setup: create test secret
    beforeAll(async () => {
      await client.send(
        new CreateSecretCommand({
          Name: testPath,
          SecretString: testValue,
        }),
      );
    });

    // teardown: delete test secret
    afterAll(async () => {
      await client.send(
        new DeleteSecretCommand({
          SecretId: testPath,
          ForceDeleteWithoutRecovery: true,
        }),
      );
    });

    when('[t0] real secret is read', () => {
      const scene = useBeforeAll(async () => ({
        result: await supplier.supply({ path: testPath }),
      }));

      then('returns actual value from Secrets Manager', () => {
        expect(scene.result).toBeDefined();
        expect(typeof scene.result).toEqual('string');
        expect(scene.result).toEqual(testValue);
      });
    });
  });

  given('[case2] supplier scheme is correct', () => {
    if (!hasAwsCredentials()) {
      throw new ConstraintError('AWS credentials required for integration test', {
        hint: 'set AWS_PROFILE or AWS credentials via keyrack',
      });
    }

    const client = new SecretsManagerClient({ region: 'us-east-1' });
    const supplier = genSdkConfigSupplierAwsSecretsManager({ client });

    then('scheme is aws::secret', () => {
      expect(supplier.scheme).toEqual('aws::secret');
    });
  });
});
