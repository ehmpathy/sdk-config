import { globSync } from 'glob';
import { BadRequestError } from 'helpful-errors';
import JSON5 from 'json5';
import type { EnvironmentConfigSlug } from 'sdk-environment';
import YAML from 'yaml';

import { readFileSync } from 'node:fs';

/**
 * .what = load config file for environment
 * .why = find and parse the correct config file based on choice
 *
 * @example
 * asStaticConfig({ statics: 'config/*.yml', choice: 'prod' })
 * // → loads config/prod.yml and returns parsed object
 */
export const asStaticConfig = (input: {
  statics: string;
  choice: EnvironmentConfigSlug;
}): Record<string, unknown> => {
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

  return parsed;
};
