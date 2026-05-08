import { given, then, when } from 'test-fns';

import { isFailfastEnvironment } from './isFailfastEnvironment';

describe('isFailfastEnvironment', () => {
  given('[case1] test environment', () => {
    when('[t0] checked', () => {
      then('returns true', () => {
        expect(
          isFailfastEnvironment({
            environment: { config: 'test', server: 'local@unix' },
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
            environment: { config: 'prep', server: 'cloud@aws.lambda' },
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
            environment: { config: 'prod', server: 'local@unix' },
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
            environment: { config: 'prod', server: 'cloud@aws.lambda' },
          }),
        ).toBe(false);
      });
    });
  });
});
