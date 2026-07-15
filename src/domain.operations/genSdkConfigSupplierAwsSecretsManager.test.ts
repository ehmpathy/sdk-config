import {
  ResourceNotFoundException,
  type SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { BadRequestError, getError, MalfunctionError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';

import {
  SupplyAbsentError,
  SupplyDeniedError,
} from '../domain.objects/SupplyError';
import { genSdkConfigSupplierAwsSecretsManager } from './genSdkConfigSupplierAwsSecretsManager';

// .note = these are UNIT tests of the retry/classify wrapper logic. per
//         rule.forbid.unit.remote-boundaries we inject a plain-object FAKE client
//         (not a jest.fn mock) via DI — the client is a constructor arg, so a fake
//         that fits the { send } shape exercises the wrapper without real AWS i/o.
//         real AWS behavior is proven in the acceptance suite.
describe('genSdkConfigSupplierAwsSecretsManager', () => {
  given('[case1] secret exists as string', () => {
    const fakeClient = {
      send: async () => ({ SecretString: 'super-secret-api-key' }),
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: fakeClient,
    });

    when('[t0] supply is called', () => {
      const scene = useBeforeAll(async () => ({
        result: await supplier.supply({ path: '/svc-x/prod/api.key' }),
      }));

      then('returns secret value', () => {
        expect(scene.result).toEqual('super-secret-api-key');
      });

      then('supplier has correct scheme', () => {
        expect(supplier.scheme).toEqual('aws::secret');
      });
    });
  });

  given('[case2] transient failure then success', () => {
    // .note = deliberate mutation — a call counter lets the fake fail the first
    //         attempt then succeed, to probe the retry path deterministically.
    let sendCount = 0;
    const fakeClient = {
      send: async () => {
        sendCount++;
        if (sendCount === 1) throw new Error('network timeout');
        return { SecretString: 'recovered-secret' };
      },
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: fakeClient,
      retries: 3,
    });

    when('[t0] supply is called', () => {
      const scene = useBeforeAll(async () => ({
        result: await supplier.supply({ path: '/svc-x/prod/oauth.secret' }),
      }));

      then('returns value after retry', () => {
        expect(scene.result).toEqual('recovered-secret');
      });
    });
  });

  given('[case3] all retries exhausted', () => {
    const fakeClient = {
      send: async () => {
        throw new Error('persistent failure');
      },
    } as unknown as SecretsManagerClient;

    when('[t0] supply is called', () => {
      const supplier = genSdkConfigSupplierAwsSecretsManager({
        client: fakeClient,
        retries: 2,
      });

      then('throws MalfunctionError', async () => {
        const error = await getError(async () =>
          supplier.supply({ path: '/svc-x/prod/broken' }),
        );
        expect(error).toBeInstanceOf(MalfunctionError);
        expect(error.message).toContain('failed to retrieve secret');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case4] secret not found', () => {
    // .note = the expected error is SupplyAbsentError (NOT a generic BadRequestError).
    //         this feature introduced the tolerable-error taxonomy: a not-found is a
    //         TOLERABLE supply error, so the supplier raises the typed SupplyAbsentError
    //         that fill can classify + tolerate for an optional field. the snapshot
    //         reflects that intentional taxonomy shift, not a weakened expectation.
    const fakeClient = {
      send: async () => {
        throw Object.assign(new Error('not found'), {
          name: 'ResourceNotFoundException',
          __proto__: ResourceNotFoundException.prototype,
        });
      },
    } as unknown as SecretsManagerClient;

    when('[t0] supply is called', () => {
      const supplier = genSdkConfigSupplierAwsSecretsManager({
        client: fakeClient,
      });

      then('throws SupplyAbsentError (tolerable)', async () => {
        const error = await getError(async () =>
          supplier.supply({ path: '/nonexistent/secret' }),
        );
        expect(error).toBeInstanceOf(SupplyAbsentError);
        expect(error.message).toContain('secret not found');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case4b] persistent access denied', () => {
    // .note = deliberate mutation — the counter proves a persistent denial is RETRIED
    //         (only a persistent denial is tolerable; a transient one must not be masked).
    let sendCount = 0;
    const fakeClient = {
      send: async () => {
        sendCount++;
        throw Object.assign(new Error('User is not authorized'), {
          name: 'AccessDeniedException',
        });
      },
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: fakeClient,
      retries: 2,
    });

    when('[t0] supply is called and denial survives retries', () => {
      const scene = useBeforeAll(async () => ({
        error: await getError(async () =>
          supplier.supply({ path: '/denied/secret' }),
        ),
      }));

      then('throws SupplyDeniedError (tolerable)', () => {
        expect(scene.error).toBeInstanceOf(SupplyDeniedError);
        expect(scene.error.message).toContain('access denied to secret');
      });

      then('retried before it threw (transient denial handled)', () => {
        expect(sendCount).toEqual(2);
      });
    });
  });

  given('[case5] secret exists as binary', () => {
    const binaryValue = new TextEncoder().encode('binary-secret-value');
    const fakeClient = {
      send: async () => ({ SecretBinary: binaryValue }),
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: fakeClient,
    });

    when('[t0] supply is called', () => {
      const scene = useBeforeAll(async () => ({
        result: await supplier.supply({ path: '/svc-x/prod/binary.key' }),
      }));

      then('decodes binary to string', () => {
        expect(scene.result).toEqual('binary-secret-value');
      });
    });
  });

  given('[case6] secret value is empty', () => {
    const fakeClient = {
      send: async () => ({
        // neither SecretString nor SecretBinary
      }),
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: fakeClient,
    });

    when('[t0] supply is called', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          supplier.supply({ path: '/svc-x/prod/empty' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('secret value is empty');
        expect(error.message).toMatchSnapshot();
      });
    });
  });
});
