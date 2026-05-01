import {
  DeleteParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { ConstraintError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';
import { getUuid } from 'uuid-fns';

import { genSdkConfigSupplierAwsParameterStore } from './genSdkConfigSupplierAwsParameterStore';

/**
 * .what = real integration tests for AWS SSM Parameter Store supplier
 * .why = verify actual aws integration works, not just mocked behavior
 *
 * .note = requires AWS credentials with SSM read/write access
 *         tests create and clean up their own resources
 */
describe('genSdkConfigSupplierAwsParameterStore.integration', () => {
  const hasAwsCredentials = (): boolean => {
    return !!(
      process.env.AWS_PROFILE ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_SESSION_TOKEN
    );
  };

  given('[case1] real AWS SSM parameter', () => {
    if (!hasAwsCredentials()) {
      throw new ConstraintError(
        'AWS credentials required for integration test',
        {
          hint: 'set AWS_PROFILE or AWS credentials via keyrack',
        },
      );
    }

    const client = new SSMClient({ region: 'us-east-1' });
    const supplier = genSdkConfigSupplierAwsParameterStore({ client });
    const testPath = `/ehmpathy/test/sdk-config/integration-test-${getUuid()}`;
    const testValue = `test-value-${getUuid()}`;

    // setup: create test parameter
    beforeAll(async () => {
      await client.send(
        new PutParameterCommand({
          Name: testPath,
          Value: testValue,
          Type: 'String',
          Overwrite: true,
        }),
      );
    });

    // teardown: delete test parameter
    afterAll(async () => {
      await client.send(new DeleteParameterCommand({ Name: testPath }));
    });

    when('[t0] real parameter is read', () => {
      const scene = useBeforeAll(async () => ({
        result: await supplier.supply({ path: testPath }),
      }));

      then('returns actual value from SSM', () => {
        expect(scene.result).toBeDefined();
        expect(typeof scene.result).toEqual('string');
        expect(scene.result).toEqual(testValue);
      });
    });
  });

  given('[case2] supplier scheme is correct', () => {
    if (!hasAwsCredentials()) {
      throw new ConstraintError(
        'AWS credentials required for integration test',
        {
          hint: 'set AWS_PROFILE or AWS credentials via keyrack',
        },
      );
    }

    const client = new SSMClient({ region: 'us-east-1' });
    const supplier = genSdkConfigSupplierAwsParameterStore({ client });

    then('scheme is aws::param', () => {
      expect(supplier.scheme).toEqual('aws::param');
    });
  });
});
