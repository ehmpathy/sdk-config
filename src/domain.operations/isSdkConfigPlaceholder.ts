/**
 * .what = does this string carry a `$.at()` placeholder, over a literal value?
 * .why = the `$.at(` prefix parts a value sdk-config must supply from one it
 *        takes as written. two callers reach different answers:
 *        - asFilledConfig — a placeholder means "fetch it from a supplier"
 *        - getOneOrg / getOneRepo — a placeholder means "throw", since both are
 *          read BEFORE any supplier runs and so can never be supplied
 *
 * .note = it asks only whether a value IS a placeholder, never whether it is a
 *         well-formed one — `asSdkConfigUri` owns that.
 *
 * @example a placeholder
 * isSdkConfigPlaceholder({ value: '$.at(aws::param)' })  // → true
 *
 * @example a literal
 * isSdkConfigPlaceholder({ value: 'ahbode' })            // → false
 */
export const isSdkConfigPlaceholder = (input: { value: string }): boolean =>
  input.value.startsWith('$.at(');
