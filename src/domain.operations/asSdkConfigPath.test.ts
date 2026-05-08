import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { SdkConfigUri } from '../domain.objects/SdkConfigUri';
import { asSdkConfigPath } from './asSdkConfigPath';

describe('asSdkConfigPath', () => {
  given('[case1] uri with null explicitPath (auto-derive)', () => {
    const uri = new SdkConfigUri({ scheme: 'aws::param', explicitPath: null });

    when('[t0] path is derived', () => {
      then('returns /{repoName}/{choice}/{keyPath}', () => {
        const result = asSdkConfigPath({
          uri,
          repoName: 'svc-x',
          choice: 'prod',
          keyPath: 'database.password',
        });
        expect(result).toEqual('/svc-x/prod/database.password');
      });
    });
  });

  given('[case2] uri with explicit path', () => {
    const uri = new SdkConfigUri({
      scheme: 'aws::param',
      explicitPath: '/shared/db/pass',
    });

    when('[t0] path is derived', () => {
      then('returns explicit path directly', () => {
        const result = asSdkConfigPath({
          uri,
          repoName: 'svc-x',
          choice: 'prod',
          keyPath: 'database.password',
        });
        expect(result).toEqual('/shared/db/pass');
      });
    });
  });

  given('[case3] empty keyPath with auto-derive', () => {
    const uri = new SdkConfigUri({ scheme: 'aws::param', explicitPath: null });

    when('[t0] path is derived', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asSdkConfigPath({
            uri,
            repoName: 'svc-x',
            choice: 'prod',
            keyPath: '',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('empty keyPath');
      });
    });
  });

  given('[case4] nested key paths', () => {
    const uri = new SdkConfigUri({ scheme: 'aws::secret', explicitPath: null });

    when('[t0] path is derived with deeply nested keyPath', () => {
      then('preserves dots in keyPath', () => {
        const result = asSdkConfigPath({
          uri,
          repoName: 'svc-api',
          choice: 'test',
          keyPath: 'services.stripe.api.secretKey',
        });
        expect(result).toEqual('/svc-api/test/services.stripe.api.secretKey');
      });
    });
  });

  given('[case5] different choice values', () => {
    const uri = new SdkConfigUri({ scheme: 'aws::param', explicitPath: null });

    when('[t0] choice is test', () => {
      then('includes test in path', () => {
        const result = asSdkConfigPath({
          uri,
          repoName: 'svc-x',
          choice: 'test',
          keyPath: 'db.host',
        });
        expect(result).toEqual('/svc-x/test/db.host');
      });
    });

    when('[t1] choice is prep', () => {
      then('includes prep in path', () => {
        const result = asSdkConfigPath({
          uri,
          repoName: 'svc-x',
          choice: 'prep',
          keyPath: 'db.host',
        });
        expect(result).toEqual('/svc-x/prep/db.host');
      });
    });
  });
});
