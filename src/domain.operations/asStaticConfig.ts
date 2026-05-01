import { globSync } from 'glob';
import { BadRequestError } from 'helpful-errors';
import JSON5 from 'json5';
import YAML from 'yaml';

import { readFileSync } from 'node:fs';

/**
 * .what = load config file for environment
 * .why = find and parse the correct config file based on access level
 *
 * @example
 * asStaticConfig({ statics: 'config/*.yml', access: 'prod' })
 * // → loads config/prod.yml and returns parsed object
 */
export const asStaticConfig = (input: {
  statics: string;
  access: string;
}): Record<string, unknown> => {
  // glob for config files
  const files = globSync(input.statics);
  if (!files.length)
    throw new BadRequestError('no config files found', {
      statics: input.statics,
      hint: 'check glob pattern matches config files',
    });

  // find file for this access level
  const accessFile = files.find((file) => {
    const filename = file.split('/').pop() ?? '';
    const basename = filename.replace(/\.(ya?ml|json5?)$/i, '');
    return basename === input.access;
  });

  if (!accessFile)
    throw new BadRequestError('config file not found for access level', {
      access: input.access,
      files,
      hint: `expected file named ${input.access}.yml, ${input.access}.yaml, or ${input.access}.json5`,
    });

  // read file
  const content = readFileSync(accessFile, 'utf-8');

  // parse based on extension
  const ext = accessFile.split('.').pop()?.toLowerCase();
  const parsed =
    ext === 'yml' || ext === 'yaml'
      ? YAML.parse(content)
      : ext === 'json5' || ext === 'json'
        ? JSON5.parse(content)
        : null;

  if (parsed === null)
    throw new BadRequestError('unsupported config file extension', {
      file: accessFile,
      extension: ext,
      hint: 'supported: .yml, .yaml, .json5, .json',
    });

  // validate parsed config is an object
  if (typeof parsed !== 'object' || Array.isArray(parsed))
    throw new BadRequestError('config must be an object', {
      file: accessFile,
      parsed,
      hint: 'config file must contain a yaml/json object, not a primitive or array',
    });

  return parsed;
};
