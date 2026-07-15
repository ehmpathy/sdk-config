/**
 * .what = detect an authz-denied error from the aws sdk
 * .why = a persistent denial is a tolerable supply error; a transient one is
 *        retried. checked by name (not instanceof) for mock compatibility and
 *        cross-sdk stability — both @aws-sdk/client-ssm and
 *        @aws-sdk/client-secrets-manager surface authz denial as an error whose
 *        .name is 'AccessDeniedException'. shared by both aws suppliers.
 */
export const isAccessDeniedError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AccessDeniedException';
