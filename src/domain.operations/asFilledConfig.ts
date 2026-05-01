import { BadRequestError } from 'helpful-errors';

import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import { asSdkConfigPath } from './asSdkConfigPath';
import { asSdkConfigUri } from './asSdkConfigUri';

/**
 * .what = recursively fill $.at() placeholders in config object
 * .why = replace placeholders with actual values from suppliers
 *
 * .note = this is an orchestrator that composes path derivation (transformers)
 *         with supplier.supply() calls (communicators).
 */
export const asFilledConfig = async (input: {
  config: Record<string, unknown>;
  suppliers: SdkConfigSupplier[];
  repoName: string;
  access: string;
}): Promise<Record<string, unknown>> => {
  const result = await fillRecursive({
    value: input.config,
    suppliers: input.suppliers,
    repoName: input.repoName,
    access: input.access,
    keyPath: '',
  });
  // input is Record<string, unknown>, output preserves that structure
  return result as Record<string, unknown>;
};

/**
 * .what = recursively traverse and fill placeholders in a value
 * .why = enables deep placeholder resolution in nested config structures
 */
const fillRecursive = async (input: {
  value: unknown;
  suppliers: SdkConfigSupplier[];
  repoName: string;
  access: string;
  keyPath: string;
}): Promise<unknown> => {
  // handle string values (potential placeholders)
  if (typeof input.value === 'string') {
    if (!input.value.startsWith('$.at(')) return input.value;

    // parse the uri
    const uri = asSdkConfigUri({ raw: input.value });

    // find supplier for this scheme
    const supplier = input.suppliers.find((s) => s.scheme === uri.scheme);
    if (!supplier)
      throw new BadRequestError('unknown scheme', {
        scheme: uri.scheme,
        raw: input.value,
        hint: `no supplier registered for scheme '${uri.scheme}'. available: ${input.suppliers.map((s) => s.scheme).join(', ') || 'none'}`,
      });

    // derive path
    const path = asSdkConfigPath({
      uri,
      repoName: input.repoName,
      access: input.access,
      keyPath: input.keyPath,
    });

    // fetch value from supplier
    return supplier.supply({ path });
  }

  // handle arrays
  if (Array.isArray(input.value)) {
    return Promise.all(
      input.value.map((item, index) =>
        fillRecursive({
          value: item,
          suppliers: input.suppliers,
          repoName: input.repoName,
          access: input.access,
          keyPath: input.keyPath ? `${input.keyPath}.${index}` : `${index}`,
        }),
      ),
    );
  }

  // handle objects
  if (input.value !== null && typeof input.value === 'object') {
    const entries = Object.entries(input.value);
    const filledEntries = await Promise.all(
      entries.map(async ([key, val]) => {
        const newKeyPath = input.keyPath ? `${input.keyPath}.${key}` : key;
        const filledVal = await fillRecursive({
          value: val,
          suppliers: input.suppliers,
          repoName: input.repoName,
          access: input.access,
          keyPath: newKeyPath,
        });
        return [key, filledVal] as const;
      }),
    );
    return Object.fromEntries(filledEntries);
  }

  // primitives pass through
  return input.value;
};
