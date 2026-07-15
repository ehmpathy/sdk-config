import { BadRequestError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import {
  SupplyAbsentError,
  SupplyDeniedError,
  SupplyError,
} from './SupplyError';

/**
 * .what = locks the public shape of the tolerable-supply-error taxonomy
 * .why = these classes are exported from the sdk; a consumer builds a custom
 *        supplier that throws them and pattern-matches on class/metadata. this
 *        snapshots their construct-time shape so a format drift surfaces in a
 *        diff, independent of the tolerance journeys that use them indirectly.
 *
 * .note = pure construction — no remote boundary, so this is a unit test. the
 *         metadata `path` is a fixed literal, so the serialized message is
 *         deterministic (no stack, no volatile cause baked in).
 */
describe('SupplyError taxonomy', () => {
  given('[case1] a SupplyDeniedError constructed with a path', () => {
    const error = new SupplyDeniedError('access denied to secret', {
      path: '/shared/api/key',
    });

    when('[t0] its class membership is checked', () => {
      then('it is a SupplyDeniedError', () => {
        expect(error).toBeInstanceOf(SupplyDeniedError);
      });

      then('it is a SupplyError (abstract base)', () => {
        expect(error).toBeInstanceOf(SupplyError);
      });

      then('it is a BadRequestError (additive, not a break)', () => {
        expect(error).toBeInstanceOf(BadRequestError);
      });
    });

    when('[t1] its shape is inspected', () => {
      then('the metadata carries the path', () => {
        expect(error.metadata.path).toEqual('/shared/api/key');
      });

      then('the serialized message matches snapshot', () => {
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case2] a SupplyAbsentError constructed with a path', () => {
    const error = new SupplyAbsentError('parameter not found', {
      path: '/test-svc/test/database.password',
    });

    when('[t0] its class membership is checked', () => {
      then('it is a SupplyAbsentError', () => {
        expect(error).toBeInstanceOf(SupplyAbsentError);
      });

      then('it is a SupplyError (abstract base)', () => {
        expect(error).toBeInstanceOf(SupplyError);
      });

      then('it is NOT a SupplyDeniedError (distinct reason)', () => {
        expect(error).not.toBeInstanceOf(SupplyDeniedError);
      });
    });

    when('[t1] its shape is inspected', () => {
      then('the serialized message matches snapshot', () => {
        expect(error.message).toMatchSnapshot();
      });
    });
  });
});
