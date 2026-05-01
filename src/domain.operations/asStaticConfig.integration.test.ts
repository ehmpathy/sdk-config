import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { join } from 'node:path';
import { asStaticConfig } from './asStaticConfig';

const TEST_CONFIG_DIR = join(__dirname, '../__test_assets__/config');

describe('asStaticConfig', () => {
  given('[case1] yaml config file', () => {
    when('[t0] loaded for test access', () => {
      then('returns parsed yaml config', () => {
        const result = asStaticConfig({
          statics: `${TEST_CONFIG_DIR}/*.yml`,
          access: 'test',
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
    when('[t0] loaded for prod access', () => {
      then('returns parsed json5 config', () => {
        const result = asStaticConfig({
          statics: `${TEST_CONFIG_DIR}/*.json5`,
          access: 'prod',
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
      then('selects correct file by access', () => {
        const result = asStaticConfig({
          statics: `${TEST_CONFIG_DIR}/*`,
          access: 'test',
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
            access: 'test',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case5] access level not found', () => {
    when('[t0] config for unknown access requested but not found', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asStaticConfig({
            statics: `${TEST_CONFIG_DIR}/*`,
            access: 'unknown',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain(
          'config file not found for access level',
        );
      });
    });
  });
});
