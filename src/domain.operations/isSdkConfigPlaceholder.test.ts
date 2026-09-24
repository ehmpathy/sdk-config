import { given, then, when } from 'test-fns';

import { isSdkConfigPlaceholder } from './isSdkConfigPlaceholder';

describe('isSdkConfigPlaceholder', () => {
  given('[case1] a placeholder value', () => {
    when('[t0] it has no explicit path', () => {
      then('it is a placeholder', () => {
        expect(isSdkConfigPlaceholder({ value: '$.at(aws::param)' })).toEqual(
          true,
        );
      });
    });

    when('[t1] it carries an explicit path', () => {
      then('it is a placeholder too', () => {
        expect(
          isSdkConfigPlaceholder({ value: '$.at(aws::param/shared/db/pass)' }),
        ).toEqual(true);
      });
    });

    when('[t2] it is malformed — the paren never closes', () => {
      then('it is STILL a placeholder', () => {
        // .note = the boundary between this and asSdkConfigUri. this answers
        //         "did the author intend a placeholder?", so a malformed one
        //         must answer yes — otherwise a typo'd `organization` would
        //         slip past getOneOrg and be spliced raw into a param name.
        expect(isSdkConfigPlaceholder({ value: '$.at(aws::param' })).toEqual(
          true,
        );
      });
    });
  });

  given('[case2] a literal value', () => {
    when('[t0] it is a plain org slug', () => {
      then('it is not a placeholder', () => {
        expect(isSdkConfigPlaceholder({ value: 'ahbode' })).toEqual(false);
      });
    });

    when('[t1] it merely mentions $.at() mid-string', () => {
      then('it is not a placeholder — the marker must come FIRST', () => {
        // .note = a config value that describes the syntax is a literal. only
        //         a marker at position 0 asks sdk-config to supply the value.
        expect(
          isSdkConfigPlaceholder({ value: 'see $.at(aws::param) for more' }),
        ).toEqual(false);
      });
    });

    when('[t2] it is empty', () => {
      then('it is not a placeholder', () => {
        expect(isSdkConfigPlaceholder({ value: '' })).toEqual(false);
      });
    });
  });
});
