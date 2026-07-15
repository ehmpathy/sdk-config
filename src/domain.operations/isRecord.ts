/**
 * .what = narrow an unknown value to a plain object (record)
 * .why = asFilledConfig returns the filled value as `unknown` (it recurses over
 *        strings/arrays/objects/primitives); this guard narrows it back to a
 *        record without an `as` cast.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
