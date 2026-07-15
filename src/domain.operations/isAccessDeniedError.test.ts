import { given, then, when } from 'test-fns';

import { isAccessDeniedError } from './isAccessDeniedError';

describe('isAccessDeniedError', () => {
  given('[case1] an error whose name is AccessDeniedException', () => {
    when('[t0] checked', () => {
      then('it is an access-denied error', () => {
        const error = Object.assign(new Error('nope'), {
          name: 'AccessDeniedException',
        });
        expect(isAccessDeniedError(error)).toEqual(true);
      });
    });
  });

  given('[case2] an error with a different name', () => {
    when('[t0] checked', () => {
      then('it is not an access-denied error', () => {
        const error = Object.assign(new Error('nope'), {
          name: 'ParameterNotFound',
        });
        expect(isAccessDeniedError(error)).toEqual(false);
      });
    });
  });

  given('[case3] a non-error value', () => {
    when('[t0] checked', () => {
      then('a plain object is not an access-denied error', () => {
        expect(isAccessDeniedError({ name: 'AccessDeniedException' })).toEqual(
          false,
        );
      });

      then('a string is not an access-denied error', () => {
        expect(isAccessDeniedError('AccessDeniedException')).toEqual(false);
      });

      then('null is not an access-denied error', () => {
        expect(isAccessDeniedError(null)).toEqual(false);
      });
    });
  });
});
