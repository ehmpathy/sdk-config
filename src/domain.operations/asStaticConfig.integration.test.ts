import { BadRequestError, getError } from 'helpful-errors';
import type { EnvironmentConfigSlug } from 'sdk-environment';
import { given, then, when } from 'test-fns';

import { join } from 'node:path';
import { asStaticConfig } from './asStaticConfig';

const TEST_CONFIG_DIR = join(__dirname, '../__test_assets__/config');

describe('asStaticConfig', () => {
  given('[case1] yaml config file', () => {
    when('[t0] loaded for test config', () => {
      then('returns parsed yaml config', () => {
        const result = asStaticConfig({
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          choice: 'test',
        });
        expect(result).toMatchObject({
          database: {
            host: 'localhost',
            port: 5432,
            password: '$.at(aws::param)',
          },
          api: {
            key: '$.at(aws::secret/shared/api/key)',
            url: 'https://api.test.example.com',
          },
        });
      });
    });
  });

  given('[case2] json5 config file', () => {
    when('[t0] loaded for prod config', () => {
      then('returns parsed json5 config', () => {
        const result = asStaticConfig({
          statics: `${TEST_CONFIG_DIR}/*.json5`,
          choice: 'prod',
        });
        expect(result).toMatchObject({
          database: {
            host: 'db.prod.example.com',
            port: 5432,
            password: '$.at(aws::param)',
          },
          api: {
            key: '$.at(aws::secret)',
            url: 'https://api.example.com',
          },
        });
      });
    });
  });

  given('[case3] multiple config files with wildcard', () => {
    when('[t0] loaded with glob that matches both yml and json5', () => {
      then('selects correct file by config', () => {
        const result = asStaticConfig({
          statics: `${TEST_CONFIG_DIR}/*`,
          choice: 'test',
        });
        expect(result.database).toMatchObject({ host: 'localhost' });
      });
    });
  });

  given('[case4] file not found', () => {
    when('[t0] glob matches no files', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asStaticConfig({
            statics: `${TEST_CONFIG_DIR}/*.nonexistent`,
            choice: 'test',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case5] choice not found', () => {
    when('[t0] unknown choice requested', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asStaticConfig({
            statics: `${TEST_CONFIG_DIR}/*`,
            choice: 'unknown' as EnvironmentConfigSlug,
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('config file not found for choice');
      });
    });
  });
});
