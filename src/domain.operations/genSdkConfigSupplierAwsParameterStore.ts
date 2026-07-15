import {
  GetParameterCommand,
  ParameterNotFound,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { BadRequestError, MalfunctionError } from 'helpful-errors';

import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import {
  SupplyAbsentError,
  SupplyDeniedError,
} from '../domain.objects/SupplyError';
import { isAccessDeniedError } from './isAccessDeniedError';

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
      // .note = deliberate mutation — a bounded retry loop is the clearest form
      //         for an imperative aws sdk call; lastError accumulates the final
      //         cause across attempts, isolated to this closure.
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
          // absence is definitive and tolerable — no retry, let the schema decide
          // check by name for better mock compatibility
          if (
            error instanceof ParameterNotFound ||
            (error instanceof Error && error.name === 'ParameterNotFound')
          )
            throw new SupplyAbsentError('parameter not found', {
              path,
              hint: 'check if parameter exists in AWS Parameter Store',
            });

          // rethrow the empty-value rejection — a present-but-empty param is fatal
          if (error instanceof BadRequestError) throw error;

          // store error for potential retry (incl. transient AccessDenied)
          lastError = error instanceof Error ? error : new Error(String(error));

          // only retry on transient failures
          if (attempt < maxRetries - 1) continue;
        }
      }

      // a denial that survived retries is persistent — tolerable, let the schema decide
      if (isAccessDeniedError(lastError))
        throw new SupplyDeniedError('access denied to parameter', {
          path,
          hint: 'reader role is not granted access to this parameter path',
          cause: lastError,
        });

      throw new MalfunctionError('failed to retrieve parameter after retries', {
        path,
        retries: maxRetries,
        lastError: lastError?.message,
      });
    },
  };
};
