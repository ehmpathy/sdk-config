import { given, then, when } from 'test-fns';

import { isFailfastEnvironment } from './isFailfastEnvironment';

describe('isFailfastEnvironment', () => {
  given('[case1] test environment', () => {
    when('[t0] checked', () => {
      then('returns true', () => {
        expect(
          isFailfastEnvironment({
            environment: { access: 'test', server: 'local' },
          }),
        ).toBe(true);
      });
    });
  });

  given('[case2] prep environment', () => {
    when('[t0] checked', () => {
      then('returns true', () => {
        expect(
          isFailfastEnvironment({
            environment: { access: 'prep', server: 'cloud' },
          }),
        ).toBe(true);
      });
    });
  });

  given('[case3] prod local environment', () => {
    when('[t0] checked', () => {
      then('returns true', () => {
        expect(
          isFailfastEnvironment({
            environment: { access: 'prod', server: 'local' },
          }),
        ).toBe(true);
      });
    });
  });

  given('[case4] prod cloud environment', () => {
    when('[t0] checked', () => {
      then('returns false (warn only)', () => {
        expect(
          isFailfastEnvironment({
            environment: { access: 'prod', server: 'cloud' },
          }),
        ).toBe(false);
      });
    });
  });
});
