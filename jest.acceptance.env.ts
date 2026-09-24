import { existsSync } from 'fs';
import { join } from 'path';
import util from 'util';

import { useKeyrack } from './src/.test/useKeyrack';

// eslint-disable-next-line no-undef
jest.setTimeout(90000); // we're calling downstream apis

// set console.log to not truncate nested objects
util.inspect.defaultOptions.depth = 5;

/**
 * .what = verify that we're running from a valid project directory; otherwise, fail fast
 * .why = prevent confusion and hard-to-debug errors from running tests in the wrong directory
 */
if (!existsSync(join(process.cwd(), 'package.json')))
  throw new Error('no package.json found in cwd. are you @gitroot?');

/**
 * .what = source credentials from keyrack for the test tier, and bar every ambient aws source, in
 *         one call.
 * .why = this REPLACED a guard that only ASSERTED `AWS_PROFILE || AWS_ACCESS_KEY_ID` was non-empty
 *        and never called `keyrack.source()`. on a host with an ambient instance role that assert
 *        passes while the sdk authenticates against the WRONG ACCOUNT — measured here as account
 *        261599400667 (`ahbode-camp-grove-role`) where the keyrack profile resolves to
 *        805192865516 (`ehmpathy-demo-for-grove`). it surfaced as an action-level AccessDenied that
 *        reads exactly like an iam policy gap.
 *
 *        ⛔ do NOT collapse this back to a presence check: a present credential is not a CORRECT
 *           credential. `useKeyrack` both supplies the right one and bars imds, so the suite runs on
 *           a keyrack credential or on none at all.
 *
 *        every argument is explicit, and each one carries weight:
 *        - `owner: 'ehmpath'` — always name the rack; the default matches today and may drift.
 *        - `mode: 'strict'` — keyrack.source has no `unlock` option (rhachet@1.47.5 accepts
 *          env|owner|key|reach|mode only), so a LOCKED rack grants no key and sets no AWS_PROFILE.
 *          `lenient` swallows that; `strict` exits 2 and names the key to unlock.
 */
useKeyrack({ env: 'test', owner: 'ehmpath', mode: 'strict' });

/**
 * .what = verify that required api keys are present; otherwise, fail fast
 * .why =
 *   - prevent time wasted waiting on tests to fail due to missing api keys
 *   - prevent agents from giving up when they have access to credentials
 */
const apikeysConfigPath = join(
  process.cwd(),
  '.agent/repo=.this/role=any/skills/use.apikeys.json',
);
if (existsSync(apikeysConfigPath)) {
  // direct import via require (json resolves automatically)
  const config = require(apikeysConfigPath);
  const requiredKeys: string[] = config?.apikeys?.required ?? [];
  const keysAbsent = requiredKeys.filter((key) => !process.env[key]);

  if (keysAbsent.length > 0) {
    throw new Error(`
⛈️  apikeys required to run these acceptance tests were not supplied.

   absent keys: ${keysAbsent.join(', ')}

   you have access to these keys - you just forgot to source them.

   run:
     source .agent/repo=.this/role=any/skills/use.apikeys.sh && npm run test:acceptance

   you must run these tests with these api keys.
   you're forbidden to give up.
   if you don't have privs to run use.apikeys.sh, ask a human for support.
   chances are, you already have privs to do so though.
`);
  }
}
