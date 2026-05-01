import { BadRequestError } from 'helpful-errors';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * .what = read repo name from package.json or use override
 * .why = enables auto-derive paths with explicit override option
 *
 * @example with override
 * getRepoName({ override: 'my-service' })
 * // → 'my-service'
 *
 * @example from package.json
 * getRepoName({})
 * // → reads name field from package.json
 */
export const getRepoName = (input: {
  override?: string;
  cwd?: string;
}): string => {
  // if override provided, return it
  if (input.override) return input.override;

  // read from package.json
  const cwd = input.cwd ?? process.cwd();
  const packagePath = join(cwd, 'package.json');

  let packageJson: { name?: string };
  try {
    const content = readFileSync(packagePath, 'utf-8');
    packageJson = JSON.parse(content);
  } catch (error) {
    // distinguish file not found from parse errors
    const errorCode = (error as NodeJS.ErrnoException)?.code;
    if (errorCode === 'ENOENT') {
      throw new BadRequestError('package.json not found', {
        path: packagePath,
        hint: 'provide repoName override or ensure package.json exists',
      });
    }
    throw new BadRequestError('package.json parse failed', {
      path: packagePath,
      error: error instanceof Error ? error.message : String(error),
      hint: 'check package.json syntax',
    });
  }

  if (!packageJson.name)
    throw new BadRequestError('package.json name field is absent', {
      path: packagePath,
      hint: 'add name field to package.json or provide repoName override',
    });

  return packageJson.name;
};
