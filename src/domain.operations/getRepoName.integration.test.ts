import { BadRequestError, getError } from 'helpful-errors';
import { join } from 'path';
import { given, then, when } from 'test-fns';

import { getRepoName } from './getRepoName';

const TEST_ASSETS_DIR = join(__dirname, '../__test_assets__');

describe('getRepoName', () => {
  given('[case1] override provided', () => {
    when('[t0] called with override', () => {
      then('returns override directly', () => {
        const result = getRepoName({ override: 'my-custom-service' });
        expect(result).toEqual('my-custom-service');
      });
    });
  });

  given('[case2] package.json with name field', () => {
    when('[t0] called without override', () => {
      then('returns name from package.json', () => {
        const result = getRepoName({
          cwd: join(TEST_ASSETS_DIR, 'fake-repo'),
        });
        expect(result).toEqual('test-repo-name');
      });
    });
  });

  given('[case3] package.json absent without override', () => {
    when('[t0] called in directory without package.json', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          getRepoName({ cwd: '/tmp/nonexistent-dir' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('package.json not found');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case4] real package.json in project root', () => {
    when('[t0] called without cwd (uses process.cwd)', () => {
      then('returns sdk-config', () => {
        const result = getRepoName({});
        expect(result).toEqual('sdk-config');
      });
    });
  });

  given('[case5] package.json with invalid json', () => {
    when('[t0] called in directory with malformed package.json', () => {
      then('throws BadRequestError with parse context', async () => {
        const error = await getError(async () =>
          getRepoName({ cwd: join(TEST_ASSETS_DIR, 'invalid-package') }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('package.json parse failed');
      });
    });
  });
});
