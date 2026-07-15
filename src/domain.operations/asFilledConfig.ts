import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';
import type { EnvironmentConfigSlug } from 'sdk-environment';

import type { SdkConfigSupplier } from '../domain.objects/SdkConfigSupplier';
import { SupplyDeniedError, SupplyError } from '../domain.objects/SupplyError';
import type { SupplyOmission } from '../domain.objects/SupplyOmission';
import { asSdkConfigPath } from './asSdkConfigPath';
import { asSdkConfigUri } from './asSdkConfigUri';
import { isRecord } from './isRecord';

/**
 * .what = recursively fill $.at() placeholders in config object
 * .why = replace placeholders with actual values from suppliers
 *
 * .note = this is an orchestrator that composes path derivation (transformers)
 *         with supplier.supply() calls (communicators).
 *
 * .note = a tolerable supply error (absent value or persistent authz-denial)
 *         does not throw here; the value is substituted with undefined and the
 *         miss is recorded in `omissions` (a SupplyOmission per unreadable key). the
 *         schema decides downstream whether the omission conforms (see
 *         genGetConfig). non-tolerable errors (throttle/network) still throw
 *         here — never masked.
 */
export const asFilledConfig = async (input: {
  static: Record<string, unknown>;
  suppliers: SdkConfigSupplier[];
  repoName: string;
  choice: EnvironmentConfigSlug;
}): Promise<{
  filled: Record<string, unknown>;
  omissions: SupplyOmission[];
}> => {
  // delegate the whole walk to fillRecursive (it handles the object branch)
  const result = await fillRecursive({
    value: input.static,
    suppliers: input.suppliers,
    repoName: input.repoName,
    choice: input.choice,
    keyPath: '',
  });

  // input.static is an object, so fillRecursive returns an object — narrow it
  // honestly via a type guard (no `as` cast). the throw is an internal invariant
  // that cannot trip given the typed input.
  if (!isRecord(result.value))
    throw new UnexpectedCodePathError('filled config is not a record', {
      value: result.value,
    });

  return { filled: result.value, omissions: result.omissions };
};

/**
 * .what = recursively traverse and fill placeholders in a value
 * .why = enables deep placeholder resolution in nested config structures
 *
 * .note = returns both the filled value and the omissions — one SupplyOmission per key
 *         whose supply was substituted with undefined, accumulated from all
 *         children.
 */
const fillRecursive = async (input: {
  value: unknown;
  suppliers: SdkConfigSupplier[];
  repoName: string;
  choice: EnvironmentConfigSlug;
  keyPath: string;
}): Promise<{
  value: unknown;
  omissions: SupplyOmission[];
}> => {
  // handle string values (potential placeholders)
  if (typeof input.value === 'string') {
    if (!input.value.startsWith('$.at('))
      return { value: input.value, omissions: [] };

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
      choice: input.choice,
      keyPath: input.keyPath,
    });

    // fetch value from supplier; tolerate absent/denied by substitute-undefined
    try {
      const supplied = await supplier.supply({ path });
      return { value: supplied, omissions: [] };
    } catch (error) {
      // tolerable supply error → substitute undefined, record the miss (key +
      // why: denied vs absent) so a downstream hard-throw can name the cause
      if (error instanceof SupplyError) {
        const reason = error instanceof SupplyDeniedError ? 'denied' : 'absent';
        return {
          value: undefined,
          omissions: [{ key: { path: input.keyPath }, reason, cause: error }],
        };
      }

      // non-tolerable (throttle/network/unknown) → never mask
      throw error;
    }
  }

  // handle arrays
  if (Array.isArray(input.value)) {
    const results = await Promise.all(
      input.value.map((item, index) =>
        fillRecursive({
          value: item,
          suppliers: input.suppliers,
          repoName: input.repoName,
          choice: input.choice,
          keyPath: input.keyPath ? `${input.keyPath}.${index}` : `${index}`,
        }),
      ),
    );
    return {
      value: results.map((r) => r.value),
      omissions: results.flatMap((r) => r.omissions),
    };
  }

  // handle objects
  if (input.value !== null && typeof input.value === 'object') {
    const entries = Object.entries(input.value);
    const filledEntries = await Promise.all(
      entries.map(async ([key, val]) => {
        const newKeyPath = input.keyPath ? `${input.keyPath}.${key}` : key;
        const filled = await fillRecursive({
          value: val,
          suppliers: input.suppliers,
          repoName: input.repoName,
          choice: input.choice,
          keyPath: newKeyPath,
        });
        return { key, value: filled.value, omissions: filled.omissions };
      }),
    );
    return {
      value: Object.fromEntries(filledEntries.map((e) => [e.key, e.value])),
      omissions: filledEntries.flatMap((e) => e.omissions),
    };
  }

  // primitives pass through
  return { value: input.value, omissions: [] };
};
