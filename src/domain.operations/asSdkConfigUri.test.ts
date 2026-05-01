import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { asSdkConfigUri } from './asSdkConfigUri';

describe('asSdkConfigUri', () => {
  given('[case1] valid $.at() string without explicit path', () => {
    when('[t0] parsed', () => {
      then('returns uri with scheme and null explicitPath', () => {
        const result = asSdkConfigUri({ raw: '$.at(aws::param)' });
        expect(result.scheme).toEqual('aws::param');
        expect(result.explicitPath).toBeNull();
      });
    });
  });

  given('[case2] valid $.at() string with explicit path', () => {
    when('[t0] parsed', () => {
      then('returns uri with scheme and explicitPath', () => {
        const result = asSdkConfigUri({
          raw: '$.at(aws::param/shared/db/pass)',
        });
        expect(result.scheme).toEqual('aws::param');
        expect(result.explicitPath).toEqual('/shared/db/pass');
      });
    });
  });

  given('[case3] aws::secret scheme', () => {
    when('[t0] parsed without explicit path', () => {
      then('returns uri with aws::secret scheme', () => {
        const result = asSdkConfigUri({ raw: '$.at(aws::secret)' });
        expect(result.scheme).toEqual('aws::secret');
        expect(result.explicitPath).toBeNull();
      });
    });

    when('[t1] parsed with explicit path', () => {
      then('returns uri with aws::secret scheme and explicitPath', () => {
        const result = asSdkConfigUri({
          raw: '$.at(aws::secret/prod/api/key)',
        });
        expect(result.scheme).toEqual('aws::secret');
        expect(result.explicitPath).toEqual('/prod/api/key');
      });
    });
  });

  given('[case4] invalid format (no $.at() wrapper)', () => {
    when('[t0] parsed', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asSdkConfigUri({ raw: 'aws::param' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('invalid $.at() format');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case5] empty $.at() content', () => {
    when('[t0] parsed', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asSdkConfigUri({ raw: '$.at()' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('empty $.at() content');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case6] absent scheme separator (::)', () => {
    when('[t0] parsed', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asSdkConfigUri({ raw: '$.at(awsparam)' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('invalid scheme format');
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case7] empty string', () => {
    when('[t0] parsed', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () => asSdkConfigUri({ raw: '' }));
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('invalid $.at() format');
      });
    });
  });

  given('[case8] malformed uri (absent close paren)', () => {
    when('[t0] parsed', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asSdkConfigUri({ raw: '$.at(aws::param' }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('invalid $.at() format');
      });
    });
  });
});
