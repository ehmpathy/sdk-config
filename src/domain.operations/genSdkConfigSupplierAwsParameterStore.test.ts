import { ParameterNotFound, type SSMClient } from '@aws-sdk/client-ssm';
import { BadRequestError, getError, MalfunctionError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';

import { genSdkConfigSupplierAwsParameterStore } from './genSdkConfigSupplierAwsParameterStore';

describe('genSdkConfigSupplierAwsParameterStore', () => {
  given('[case1] parameter exists', () => {
    const mockClient = {
      send: jest.fn().mockResolvedValue({
        Parameter: { Value: 'secret-password-123' },
      }),
    } as unknown as SSMClient;

    const supplier = genSdkConfigSupplierAwsParameterStore({
      client: mockClient,
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
    const mockClient = {
      send: jest
        .fn()
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce({
          Parameter: { Value: 'recovered-value' },
        }),
    } as unknown as SSMClient;

    const supplier = genSdkConfigSupplierAwsParameterStore({
      client: mockClient,
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
    const mockClient = {
      send: jest.fn().mockRejectedValue(new Error('persistent failure')),
    } as unknown as SSMClient;

    when('[t0] supply is called', () => {
      const supplier = genSdkConfigSupplierAwsParameterStore({
        client: mockClient,
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
    const mockClient = {
      send: jest.fn().mockRejectedValue(
        Object.assign(new Error('not found'), {
          name: 'ParameterNotFound',
          __proto__: ParameterNotFound.prototype,
        }),
      ),
    } as unknown as SSMClient;

    when('[t0] supply is called', () => {
      const supplier = genSdkConfigSupplierAwsParameterStore({
        client: mockClient,
      });

      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          supplier.supply({ path: '/nonexistent/param' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('parameter not found');
        expect(error.message).toMatchSnapshot();
      });
    });
  });
});
