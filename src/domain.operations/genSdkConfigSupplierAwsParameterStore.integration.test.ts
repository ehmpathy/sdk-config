import {
  DeleteParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { ConstraintError, getError, MalfunctionError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';
import { getUuid } from 'uuid-fns';

import { SupplyAbsentError } from '../domain.objects/SupplyError';
import { asSdkConfigPath } from './asSdkConfigPath';
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

  given('[case3] a parameter that does not exist in AWS', () => {
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
    const absentPath = `/ehmpathy/test/sdk-config/absent-${getUuid()}`;

    when('[t0] the absent parameter is read', () => {
      then('throws a SupplyAbsentError (tolerable not-found)', async () => {
        const error = await getError(supplier.supply({ path: absentPath }));
        expect(error).toBeInstanceOf(SupplyAbsentError);
      });
    });
  });

  given('[case4] the DERIVED four-segment address, put to live aws', () => {
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

    // the address is built by the REAL derive, never hand-typed here
    const derived = asSdkConfigPath({
      uri: { scheme: 'aws::param', explicitPath: null },
      org: 'test-org',
      repo: 'test-svc',
      choice: 'test',
      keyPath: `absent-${getUuid()}`,
    });

    when('[t0] the shape of the address is checked', () => {
      then('the derive emitted four segments, org first', () => {
        expect(derived.split('/')).toHaveLength(5); // a lead '' + 4
        expect(derived.startsWith('/test-org/test-svc/test/')).toBe(true);
      });
    });

    when('[t1] that address is read against the live store', () => {
      then('aws ACCEPTS the name — absent, never malformed', async () => {
        // 🔴 this is the half of the round-trip a read-only grant CAN reach,
        //    and it is the half this change is actually about.
        //
        // ⇒ ssm answers a well-formed-but-absent name with
        //   `ParameterNotFound`, which the supplier raises as a
        //   `SupplyAbsentError`. it answers a MALFORMED name with
        //   `ValidationException`, which is a different class entirely
        //   ([t2] proves ssm really does discriminate, so this pass is not
        //   vacuous).
        //
        // ⇒ so a green here is a live statement by aws that
        //   `/test-org/test-svc/test/…` IS a name it accepts — which is
        //   precisely the claim the org segment introduces, and the claim
        //   no unit test can make.
        const error = await getError(supplier.supply({ path: derived }));
        expect(error).toBeInstanceOf(SupplyAbsentError);
      });
    });

    when('[t2] a MALFORMED address is read against the live store', () => {
      then('aws REJECTS it — so [t1] is a real discrimination', async () => {
        // ⛔ do NOT delete this as a test of aws over a test of us. without
        //    it, [t1] proves only that SOME error came back, and a build
        //    whose derive emitted garbage would pass it just as green.
        //    this case is what makes [t1]'s `SupplyAbsentError` mean
        //    "accepted" over merely "failed".
        //
        // .note = the assertion is on OUR classes, never on aws's text. a
        //         malformed name surfaces as a `MalfunctionError`, an absent
        //         one as a `SupplyAbsentError` — two classes, so the
        //         discrimination holds even when aws rewrites its message.
        const error = await getError(
          supplier.supply({ path: '/test org/has spaces' }),
        );
        expect(error).not.toBeInstanceOf(SupplyAbsentError);
        expect(error).toBeInstanceOf(MalfunctionError);
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
