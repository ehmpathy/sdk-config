import { ParameterNotFound, type SSMClient } from '@aws-sdk/client-ssm';
import { getError, MalfunctionError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';

import {
  SupplyAbsentError,
  SupplyDeniedError,
} from '../domain.objects/SupplyError';
import { genSdkConfigSupplierAwsParameterStore } from './genSdkConfigSupplierAwsParameterStore';

// .note = these are UNIT tests of the retry/classify wrapper logic. per
//         rule.forbid.unit.remote-boundaries we inject a plain-object FAKE client
//         (not a jest.fn mock) via DI — the client is a constructor arg, so a fake
//         that fits the { send } shape exercises the wrapper without real AWS i/o.
//         real AWS behavior is proven in the acceptance suite.
describe('genSdkConfigSupplierAwsParameterStore', () => {
  given('[case1] parameter exists', () => {
    const fakeClient = {
      send: async () => ({ Parameter: { Value: 'secret-password-123' } }),
    } as unknown as SSMClient;

    const supplier = genSdkConfigSupplierAwsParameterStore({
      client: fakeClient,
    });

    when('[t0] supply is called', () => {
      const scene = useBeforeAll(async () => ({
        result: await supplier.supply({
          path: '/svc-x/prod/database.password',
        }),
      }));

      then('returns parameter value', () => {
        expect(scene.result).toEqual('secret-password-123');
      });

      then('supplier has correct scheme', () => {
        expect(supplier.scheme).toEqual('aws::param');
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
        return { Parameter: { Value: 'recovered-value' } };
      },
    } as unknown as SSMClient;

    const supplier = genSdkConfigSupplierAwsParameterStore({
      client: fakeClient,
      retries: 3,
    });

    when('[t0] supply is called', () => {
      const scene = useBeforeAll(async () => ({
        result: await supplier.supply({ path: '/svc-x/prod/api.key' }),
      }));

      then('returns value after retry', () => {
        expect(scene.result).toEqual('recovered-value');
      });
    });
  });

  given('[case3] all retries exhausted', () => {
    const fakeClient = {
      send: async () => {
        throw new Error('persistent failure');
      },
    } as unknown as SSMClient;

    when('[t0] supply is called', () => {
      const supplier = genSdkConfigSupplierAwsParameterStore({
        client: fakeClient,
        retries: 2,
      });

      then('throws MalfunctionError', async () => {
        const error = await getError(async () =>
          supplier.supply({ path: '/svc-x/prod/broken' }),
        );
        expect(error).toBeInstanceOf(MalfunctionError);
        expect(error.message).toContain('failed to retrieve parameter');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case4] parameter not found', () => {
    // .note = the expected error is SupplyAbsentError (NOT a generic BadRequestError).
    //         this feature introduced the tolerable-error taxonomy: a not-found is a
    //         TOLERABLE supply error, so the supplier raises the typed SupplyAbsentError
    //         that fill can classify + tolerate for an optional field. the snapshot
    //         reflects that intentional taxonomy shift, not a weakened expectation.
    const fakeClient = {
      send: async () => {
        throw Object.assign(new Error('not found'), {
          name: 'ParameterNotFound',
          __proto__: ParameterNotFound.prototype,
        });
      },
    } as unknown as SSMClient;

    when('[t0] supply is called', () => {
      const supplier = genSdkConfigSupplierAwsParameterStore({
        client: fakeClient,
      });

      then('throws SupplyAbsentError (tolerable)', async () => {
        const error = await getError(async () =>
          supplier.supply({ path: '/nonexistent/param' }),
        );
        expect(error).toBeInstanceOf(SupplyAbsentError);
        expect(error.message).toContain('parameter not found');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case5] persistent access denied', () => {
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
    } as unknown as SSMClient;

    const supplier = genSdkConfigSupplierAwsParameterStore({
      client: fakeClient,
      retries: 2,
    });

    when('[t0] supply is called and denial survives retries', () => {
      const scene = useBeforeAll(async () => ({
        error: await getError(async () =>
          supplier.supply({ path: '/denied/param' }),
        ),
      }));

      then('throws SupplyDeniedError (tolerable)', () => {
        expect(scene.error).toBeInstanceOf(SupplyDeniedError);
        expect(scene.error.message).toContain('access denied to parameter');
      });

      then('retried before it threw (transient denial handled)', () => {
        // a transient denial is retried; only a persistent one is tolerable
        expect(sendCount).toEqual(2);
      });
    });
  });
});
