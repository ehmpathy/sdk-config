import {
  GetSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { BadRequestError, MalfunctionError } from 'helpful-errors';

import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import {
  SupplyAbsentError,
  SupplyDeniedError,
} from '../domain.objects/SupplyError';
import { isAccessDeniedError } from './isAccessDeniedError';

/**
 * .what = factory for AWS Secrets Manager supplier
 * .why = enables retrieval of secrets from AWS Secrets Manager
 */
export const genSdkConfigSupplierAwsSecretsManager = (input?: {
  retries?: number;
  client?: SecretsManagerClient;
}): SdkConfigSupplier => {
  const maxRetries = input?.retries ?? 3;
  const client = input?.client ?? new SecretsManagerClient({});

  return {
    scheme: 'aws::secret',
    supply: async ({ path }) => {
      // .note = deliberate mutation — a bounded retry loop is the clearest form
      //         for an imperative aws sdk call; lastError accumulates the final
      //         cause across attempts, isolated to this closure.
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = await client.send(
            new GetSecretValueCommand({
              SecretId: path,
            }),
          );

          // secrets can be string or binary
          if (response.SecretString) return response.SecretString;

          if (response.SecretBinary) {
            // decode binary secret to string
            const decoder = new TextDecoder();
            return decoder.decode(response.SecretBinary);
          }

          throw new BadRequestError('secret value is empty', {
            path,
            hint: 'secret exists but has no value',
          });
        } catch (error) {
          // absence is definitive and tolerable — no retry, let the schema decide
          // check by name for better mock compatibility
          if (
            error instanceof ResourceNotFoundException ||
            (error instanceof Error &&
              error.name === 'ResourceNotFoundException')
          )
            throw new SupplyAbsentError('secret not found', {
              path,
              hint: 'check if secret exists in AWS Secrets Manager',
            });

          // rethrow BadRequestError from empty value check
          if (error instanceof BadRequestError) throw error;

          // store error for potential retry (incl. transient AccessDenied)
          lastError = error instanceof Error ? error : new Error(String(error));

          // only retry on transient failures
          if (attempt < maxRetries - 1) continue;
        }
      }

      // a denial that survived retries is persistent — tolerable, let the schema decide
      if (isAccessDeniedError(lastError))
        throw new SupplyDeniedError('access denied to secret', {
          path,
          hint: 'reader role is not granted access to this secret path',
          cause: lastError,
        });

      throw new MalfunctionError('failed to retrieve secret after retries', {
        path,
        retries: maxRetries,
        lastError: lastError?.message,
      });
    },
  };
};
