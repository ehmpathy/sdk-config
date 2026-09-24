import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import util from 'util';

import { useKeyrack } from './src/.test/useKeyrack';

// eslint-disable-next-line no-undef
jest.setTimeout(90000); // since we're calling downstream apis

// set console.log to not truncate nested objects
util.inspect.defaultOptions.depth = 5;

/**
 * .what = verify that we're running from a valid project directory; otherwise, fail fast
 * .why = prevent confusion and hard-to-debug errors from running tests in the wrong directory
 */
if (!existsSync(join(process.cwd(), 'package.json')))
  throw new Error('no package.json found in cwd. are you @gitroot?');

/**
 * sanity check that unit tests are only run the 'test' environment
 *
 * usecases
 * - prevent polluting prod state with test data
 * - prevent executing financially impacting mutations
 */
if (
  (process.env.NODE_ENV !== 'test' ||
    (process.env.STAGE && process.env.STAGE !== 'test')) &&
  process.env.I_KNOW_WHAT_IM_DOING !== 'true'
)
  throw new Error(`integration.test is not targeting stage 'test'`);

const declapractUsePath = join(process.cwd(), 'declapract.use.yml');
const declapractUseContent = existsSync(declapractUsePath)
  ? readFileSync(declapractUsePath, 'utf8')
  : '';

/**
 * .what = source credentials from keyrack for the test tier and export them for the aws sdk, in one call.
 * .why = useKeyrack is the org convention: it sources keyrack (sets AWS_PROFILE) and — for an aws
 *        consumer — exports the sso profile's static creds so the sdk auths against the target.
 *
 *        ⛔ this REPLACED a guard that only ASSERTED `AWS_PROFILE || AWS_ACCESS_KEY_ID` was
 *           non-empty and never called `keyrack.source()`. on a host with an ambient instance role
 *           that assert passes while the sdk authenticates against the WRONG ACCOUNT — measured
 *           here as account 261599400667 (`ahbode-camp-grove-role`) where the keyrack profile
 *           resolves to 805192865516 (`ehmpathy-demo-for-grove`). it surfaced as an action-level
 *           AccessDenied that reads exactly like an iam policy gap, so do NOT collapse this back
 *           to a presence check: a present credential is not a CORRECT credential.
 *
 *        ⛔ every argument here is explicit and load-bearing; none is a default to relax.
 *           - `owner: 'ehmpath'` — always name the rack. the default is the same value today, so
 *             an implicit call reads identical and drifts the day the default moves.
 *           - `mode: 'strict'` — keyrack.source has no `unlock` option (rhachet@1.47.5 accepts
 *             env|owner|key|reach|mode only), so a LOCKED rack grants no key and sets no
 *             AWS_PROFILE — the precise state that let the ambient role take over above.
 *             `lenient` swallows that; `strict` exits 2 and names the key to unlock.
 */
useKeyrack({ env: 'test', owner: 'ehmpath', mode: 'strict' });

/**
 * .what = verify that the testdb has been provisioned if a databaseUserName is declared
 * .why =
 *   - prevent time wasted waiting on tests to fail due to missing testdb
 *   - prevent confusing "password authentication failed" errors when testdb isn't running or was provisioned for a different repo
 */
const requiresTestDb = declapractUseContent.includes('databaseUserName');
if (requiresTestDb) {
  const testConfigPath = join(process.cwd(), 'config', 'test.json');
  if (!existsSync(testConfigPath))
    throw new Error(
      'config/test.json not found but serviceUser is declared in declapract.use.yml',
    );
  const testConfig = JSON.parse(readFileSync(testConfigPath, 'utf8'));
  if (
    !testConfig.database?.tunnel?.local ||
    !testConfig.database?.role?.crud ||
    !testConfig.database?.target?.database
  )
    throw new Error(
      'config/test.json database.tunnel.local, database?.role?.crud, or database?.target?.database not found but expected',
    );
  try {
    execSync(
      `PGPASSWORD="${testConfig.database.role.crud.password}" psql -h ${testConfig.database.tunnel.local.host} -p ${testConfig.database.tunnel.local.port} -U ${testConfig.database.role.crud.username} -d ${testConfig.database.target.database} -c "SELECT 1" > /dev/null 2>&1`,
      { timeout: 3000 },
    );
  } catch {
    throw new Error(
      `did you forget to \`npm run start:testdb\`? cant connect to database`,
    );
  }
}

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
⛈️  apikeys required to run these integration tests were not supplied.

   absent keys: ${keysAbsent.join(', ')}

   you have access to these keys - you just forgot to source them.

   run:
     source .agent/repo=.this/role=any/skills/use.apikeys.sh && npm run test:integration

   you must run these tests with these api keys.
   you're forbidden to give up.
   if you don't have privs to run use.apikeys.sh, ask a human for support.
   chances are, you already have privs to do so though.
`);
  }
}
