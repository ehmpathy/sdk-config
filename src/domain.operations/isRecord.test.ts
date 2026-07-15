import { given, then, when } from 'test-fns';

import { isRecord } from './isRecord';

describe('isRecord', () => {
  given('[case1] a plain object', () => {
    when('[t0] checked', () => {
      then('it is a record', () => {
        expect(isRecord({ a: 1 })).toEqual(true);
      });

      then('an empty object is a record', () => {
        expect(isRecord({})).toEqual(true);
      });
    });
  });

  given('[case2] a non-record value', () => {
    when('[t0] checked', () => {
      then('an array is not a record', () => {
        expect(isRecord([1, 2, 3])).toEqual(false);
      });

      then('null is not a record', () => {
        expect(isRecord(null)).toEqual(false);
      });

      then('a string is not a record', () => {
        expect(isRecord('nope')).toEqual(false);
      });

      then('a number is not a record', () => {
        expect(isRecord(42)).toEqual(false);
      });

      then('undefined is not a record', () => {
        expect(isRecord(undefined)).toEqual(false);
      });
    });
  });
});
