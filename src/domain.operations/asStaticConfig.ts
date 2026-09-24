import { globSync } from 'glob';
import { BadRequestError } from 'helpful-errors';
import JSON5 from 'json5';
import type { EnvironmentConfigSlug } from 'sdk-environment';
import YAML from 'yaml';

import { readFileSync } from 'node:fs';
import type { OrgSlug } from '../domain.objects/OrgSlug';
import type { RepoSlug } from '../domain.objects/RepoSlug';
import { getOneOrg } from './getOneOrg';
import { getOneRepo } from './getOneRepo';

/**
 * .what = load the config file for an environment, plus the org and repo it names
 * .why = find and parse the correct config file based on choice
 *
 * .note = the two path segments ride along, so a parsed config and its
 *         `{ org, repo }` are ONE value — this is the only route to either, and
 *         a surface added later inherits both by construction.
 *
 * .note = an org has no default, so the config must declare it. a repo's name
 *         is already in `package.json`, so `repository` is the explicit route
 *         and that name is the default.
 *
 * @example
 * asStaticConfig({ statics: 'config/*.yml', choice: 'prod' })
 * // → { config: { … }, org: 'ahbode', repo: 'svc-raisefloor' }
 */
export const asStaticConfig = (input: {
  statics: string;
  choice: EnvironmentConfigSlug;
}): {
  config: Record<string, unknown>;
  org: OrgSlug;
  repo: RepoSlug;
} => {
  // glob for config files
  const files = globSync(input.statics);
  if (!files.length)
    throw new BadRequestError('no config files found', {
      statics: input.statics,
      hint: 'check glob pattern matches config files',
    });

  // find file for this choice
  const choiceFile = files.find((file) => {
    const filename = file.split('/').pop() ?? '';
    const basename = filename.replace(/\.(ya?ml|json5?)$/i, '');
    return basename === input.choice;
  });

  if (!choiceFile)
    throw new BadRequestError('config file not found for choice', {
      choice: input.choice,
      files,
      hint: `expected file named ${input.choice}.yml, ${input.choice}.yaml, or ${input.choice}.json5`,
    });

  // read file
  const content = readFileSync(choiceFile, 'utf-8');

  // parse based on extension
  const ext = choiceFile.split('.').pop()?.toLowerCase();
  const parsed =
    ext === 'yml' || ext === 'yaml'
      ? YAML.parse(content)
      : ext === 'json5' || ext === 'json'
        ? JSON5.parse(content)
        : null;

  if (parsed === null)
    throw new BadRequestError('unsupported config file extension', {
      file: choiceFile,
      extension: ext,
      hint: 'supported: .yml, .yaml, .json5, .json',
    });

  // validate parsed config is an object
  if (typeof parsed !== 'object' || Array.isArray(parsed))
    throw new BadRequestError('config must be an object', {
      file: choiceFile,
      parsed,
      hint: 'config file must contain a yaml/json object, not a primitive or array',
    });

  // read the two segments a derived path leads with — the parse is not done
  // without them
  return {
    config: parsed,
    org: getOneOrg({ static: parsed }),
    repo: getOneRepo({ static: parsed, cwd: null }),
  };
};
