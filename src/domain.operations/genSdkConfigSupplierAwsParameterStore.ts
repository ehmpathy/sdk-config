import {
  GetParameterCommand,
  ParameterNotFound,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { BadRequestError, MalfunctionError } from 'helpful-errors';

import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';

/**
 * .what = factory for SSM Parameter Store supplier
 * .why = enables retrieval of config values from AWS Parameter Store
 */
export const genSdkConfigSupplierAwsParameterStore = (input?: {
  retries?: number;
  client?: SSMClient;
}): SdkConfigSupplier => {
  const maxRetries = input?.retries ?? 3;
  const client = input?.client ?? new SSMClient({});

  return {
    scheme: 'aws::param',
    supply: async ({ path }) => {
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = await client.send(
            new GetParameterCommand({
              Name: path,
              WithDecryption: true,
            }),
          );

          if (!response.Parameter?.Value)
            throw new BadRequestError('parameter value is empty', {
              path,
              hint: 'parameter exists but has no value',
            });

          return response.Parameter.Value;
        } catch (error) {
          // check by name for better mock compatibility
          if (
            error instanceof ParameterNotFound ||
            (error instanceof Error && error.name === 'ParameterNotFound')
          )
            throw new BadRequestError('parameter not found', {
              path,
              hint: 'check if parameter exists in AWS Parameter Store',
            });

          // store error for potential retry
          lastError = error instanceof Error ? error : new Error(String(error));

          // only retry on transient failures
          if (attempt < maxRetries - 1) continue;
        }
      }

      throw new MalfunctionError('failed to retrieve parameter after retries', {
        path,
        retries: maxRetries,
        lastError: lastError?.message,
      });
    },
  };
};
