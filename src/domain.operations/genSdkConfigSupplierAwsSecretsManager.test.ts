import {
  ResourceNotFoundException,
  type SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { BadRequestError, getError, MalfunctionError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';

import { genSdkConfigSupplierAwsSecretsManager } from './genSdkConfigSupplierAwsSecretsManager';

describe('genSdkConfigSupplierAwsSecretsManager', () => {
  given('[case1] secret exists as string', () => {
    const mockClient = {
      send: jest.fn().mockResolvedValue({
        SecretString: 'super-secret-api-key',
      }),
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: mockClient,
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
    const mockClient = {
      send: jest
        .fn()
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce({
          SecretString: 'recovered-secret',
        }),
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: mockClient,
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
    const mockClient = {
      send: jest.fn().mockRejectedValue(new Error('persistent failure')),
    } as unknown as SecretsManagerClient;

    when('[t0] supply is called', () => {
      const supplier = genSdkConfigSupplierAwsSecretsManager({
        client: mockClient,
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
    const mockClient = {
      send: jest.fn().mockRejectedValue(
        Object.assign(new Error('not found'), {
          name: 'ResourceNotFoundException',
          __proto__: ResourceNotFoundException.prototype,
        }),
      ),
    } as unknown as SecretsManagerClient;

    when('[t0] supply is called', () => {
      const supplier = genSdkConfigSupplierAwsSecretsManager({
        client: mockClient,
      });

      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          supplier.supply({ path: '/nonexistent/secret' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('secret not found');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case5] secret exists as binary', () => {
    const binaryValue = new TextEncoder().encode('binary-secret-value');
    const mockClient = {
      send: jest.fn().mockResolvedValue({
        SecretBinary: binaryValue,
      }),
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: mockClient,
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
    const mockClient = {
      send: jest.fn().mockResolvedValue({
        // neither SecretString nor SecretBinary
      }),
    } as unknown as SecretsManagerClient;

    const supplier = genSdkConfigSupplierAwsSecretsManager({
      client: mockClient,
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
