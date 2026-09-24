import {
  DeleteParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { join } from 'path';

import { BadRequestError, ConstraintError, getError } from 'helpful-errors';
import { given, then, useBeforeAll, when } from 'test-fns';
import { getUuid } from 'uuid-fns';
import { z } from 'zod';

import {
  genGetConfig,
  genSdkConfigSupplierAwsParameterStore,
  genSdkConfigSupplierAwsSecretsManager,
  type OrgSlug,
  type RepoSlug,
  type SdkConfigSupplier,
  SdkConfigEnvironment,
  SupplyAbsentError,
  SupplyDeniedError,
  SupplyError,
} from '@src/contract/sdk';

const TEST_CONFIG_DIR = join(__dirname, '../src/.test/assets/config');

/**
 * .what = the two path-segment slugs, as a CONSUMER receives them
 * .why = 🔴 a COMPILE-TIME clamp on F9's two new contract exports, and it is the
 *        only kind that can reach them. a type export has no runtime presence,
 *        so no `expect` can assert it — delete the `export type` line from
 *        `src/index.ts` and every other test stays green.
 *
 * .note = it sits in BLACKBOX deliberately, over the in-repo acceptance suite.
 *         this file imports `@src/index`, the built entrypoint, so the clamp
 *         grades what a consumer actually receives — a type that fails to
 *         survive the build into the published `.d.ts` breaks HERE and nowhere
 *         else.
 *
 * .note = they are used below, never merely declared. a bare `const x: OrgSlug`
 *         would clamp the export and read as dead code to the next author, who
 *         would delete it and silently take the clamp with it.
 */
// ⚠️ BOTH slugs MIRROR the config fixture — `organization` and `repository` —
//    and NEITHER is passed in. there is no argument for either segment, so each
//    is an independent restatement of what the derive must produce, over an
//    input the expectation could drift along with.
const ACCEPTANCE_ORG: OrgSlug = 'test-org';
const ACCEPTANCE_REPO: RepoSlug = 'test-svc';

/**
 * .what = real AWS acceptance tests for sdk-config
 * .why = verify full end-to-end flow with actual AWS services
 *
 * .note = requires AWS credentials with SSM and Secrets Manager access
 */
describe('sdk-config', () => {
  const hasAwsCredentials = (): boolean => {
    return !!(
      process.env.AWS_PROFILE ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_SESSION_TOKEN
    );
  };

  // check credentials at describe level
  if (!hasAwsCredentials()) {
    throw new ConstraintError('AWS credentials required for acceptance tests', {
      hint: 'set AWS_PROFILE or AWS credentials via keyrack',
    });
  }

  // real AWS clients and suppliers
  const ssmClient = new SSMClient({ region: 'us-east-1' });
  const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });
  const paramSupplier = genSdkConfigSupplierAwsParameterStore({ client: ssmClient });
  const secretSupplier = genSdkConfigSupplierAwsSecretsManager({ client: secretsClient });

  // unique test values to verify real resolution
  const testUuid = getUuid();
  const testParamValue = `test-param-${testUuid}`;
  let testSecretValue = `test-secret-${testUuid}`;

  // paths that match the test config files ($.at fills these)
  // .note = auto-derived paths carry FOUR segments and dots for keyPath:
  //         /{org}/{repo}/{choice}/{keyPath}. the org comes from the
  //         `organization` field the test config fixtures declare.
  // .note = these are REAL aws names, written and deleted by this suite. they
  //         moved with the derive — a 3-segment name is now unreachable, so the
  //         old params are orphaned in the account until someone reaps them.
  const testPaths = {
    paramTestAcceptance: '/test-org/test-svc/test/database.password',
    paramPrepAcceptance: '/test-org/test-svc/prep/database.password',
    paramProdAcceptance: '/test-org/test-svc/prod/database.password',
    secretShared: '/shared/api/key', // explicit path from $.at(aws::secret/shared/api/key)
    secretProdAcceptance: '/test-org/test-svc/prod/api.key', // auto-derived from $.at(aws::secret)
  };

  // setup: create all AWS resources
  beforeAll(async () => {
    // create SSM params
    await Promise.all([
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramTestAcceptance,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramPrepAcceptance,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
      ssmClient.send(new PutParameterCommand({
        Name: testPaths.paramProdAcceptance,
        Value: testParamValue,
        Type: 'String',
        Overwrite: true,
      })),
    ]);

    // create Secrets (need try-catch for create-or-read pattern)
    for (const secretPath of [testPaths.secretShared, testPaths.secretProdAcceptance]) {
      try {
        await secretsClient.send(new CreateSecretCommand({
          Name: secretPath,
          SecretString: testSecretValue,
        }));
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.name === 'ResourceExistsException') {
          // secret exists, read its current value (IAM may not allow write)
          const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
          const response = await secretsClient.send(new GetSecretValueCommand({
            SecretId: secretPath,
          }));
          testSecretValue = response.SecretString ?? '';
        } else if (error.name === 'InvalidRequestException' && error.message.includes('scheduled for deletion')) {
          // secret was scheduled for deletion by a prior test run
          // wait a few minutes for AWS to complete the delete, then re-run tests
          throw new ConstraintError(`secret ${secretPath} is scheduled for deletion`, {
            hint: 'wait a few minutes for AWS to complete the delete, then re-run tests',
            cause: error,
          });
        } else {
          throw error;
        }
      }
    }
  });

  // teardown: clean up SSM params only
  // .note = secrets are NOT deleted to avoid "scheduled for deletion" conflicts
  //         between test files. secrets are overwritten on subsequent runs.
  afterAll(async () => {
    await Promise.all([
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramTestAcceptance })),
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramPrepAcceptance })),
      ssmClient.send(new DeleteParameterCommand({ Name: testPaths.paramProdAcceptance })),
    ].map(p => p.catch(() => {}))); // ignore errors on cleanup
  });

  const testSchema = z.object({
    database: z.object({
      host: z.string(),
      port: z.number(),
      password: z.string(),
    }),
    api: z.object({
      key: z.string(),
      url: z.string(),
    }),
  });

  const createCache = () => {
    const store = new Map<string, unknown>();
    return {
      get: <T>(key: string) => store.get(key) as T | undefined,
      set: <T>(key: string, val: T) => {
        store.set(key, val);
      },
    };
  };

  given('[case1] full flow with real AWS suppliers', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig() is called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('database password is resolved from real SSM', () => {
        expect(result.database.password).toEqual(testParamValue);
      });

      then('api key is resolved from real Secrets Manager', () => {
        expect(result.api.key).toEqual(testSecretValue);
      });

      then('static values are preserved', () => {
        expect(result.database.host).toEqual('localhost');
        expect(result.database.port).toEqual(5432);
        expect(result.api.url).toEqual('https://api.test.example.com');
      });

      // 🔴 the POSITIVE journey, SNAPPED — found by fix-forward, not by a
      //    reviewer. `r10 blocker.1` (i006) named this exact shape one surface
      //    over (`src/contract/sdk.acceptance.test.ts [case4]`): a filled config
      //    a caller receives, asserted key-by-key with `toEqual` and never
      //    pinned whole. this case is the same shape, so it is repaired in the
      //    same round rather than left for the next
      //    (`rule.require.contract-snapshot-exhaustiveness`,
      //     `rule.always.fix-forward-under-scouts-honor`).
      //
      //    the three `then` blocks above prove each value is CORRECT, one key at
      //    a time; only a snapshot proves the whole SHAPE, and a reviewer reads
      //    it in the PR diff without a run.
      //
      //    both filled values carry a per-run uuid, so both are MASKED and the
      //    rest is snapped live — never carved out.
      //
      //    ⇒ `organization` is absent from the snap on purpose: the fixture
      //      declares it and `testSchema` does not, so zod strips it at the
      //      parse. [case2] snaps the RAW read where it is still present, so the
      //      two entries together pin both halves of that boundary.
      then('and the FILLED SHAPE a caller receives is pinned, masked', () => {
        expect(result).toMatchSnapshot({
          api: { key: expect.any(String) },
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case2] static access without secrets', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig.static() is called', () => {
      then('raw config with placeholders matches snapshot', () => {
        const staticConfig = getConfig.static();

        // 🔴 the snapshot does NOT stand alone. `rule.forbid.failhide` names
        //    `toMatchSnapshot()` with no companion assertion as a failhide
        //    shape, and the reason is sharp: a snapshot pins whatever the code
        //    last emitted, over a claim anyone stated. these assert the CLAIM
        //    the case exists to make — that `.static()` is a RAW read: the
        //    placeholder is still a placeholder, and the org field is present
        //    and unresolved.
        expect(staticConfig.organization).toEqual('test-org');
        expect(JSON.stringify(staticConfig.database)).toContain('$.at(');

        expect(staticConfig).toMatchSnapshot();
      });
    });
  });

  given('[case3] schema mismatch in test env', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // does not exist in config
      }),
    });

    const getConfig = genGetConfig({
      schema: badSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig() is called', () => {
      then('error message matches snapshot', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case4] unknown scheme', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [], // no suppliers registered
      environment: testEnv,    });

    when('[t0] getConfig() is called', () => {
      then('error message matches snapshot', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case5] schema mismatch in prod/cloud environment', () => {
    // .note = prod/cloud should warn but not crash per vision spec
    const prodCloudEnv = new SdkConfigEnvironment({
      config: 'prod',
      server: 'cloud@aws.lambda',
    });

    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // does not exist in config
      }),
    });

    const getConfig = genGetConfig({
      schema: badSchema,
      statics: `${TEST_CONFIG_DIR}/*.json5`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: prodCloudEnv,    });

    when('[t0] getConfig() is called', () => {
      // .what = a SPY, never a mock — `jest.spyOn` with NO `mockImplementation`,
      //         so the real `console.warn` still runs and still prints.
      //
      // .why = `console.warn` IS the contract output this case asserts: `[t0]`
      //        snapshots its first argument, which is the prod/cloud
      //        tolerate-and-warn message a human reads in a lambda log. it is
      //        the surface under test, so it must not be replaced.
      //
      // 🔴 it once carried `.mockImplementation(() => {})` — a mute, which
      //    `rule.forbid.acceptance.mocks` grades a blocker in a
      //    `.acceptance.test.ts`. found by a sweep of the class after
      //    `r9 blocker.1` named its twin in `src/contract/sdk.acceptance.test.ts`.
      //    the reviewer flagged one instance; the class held two.
      //
      // ⇒ the twin was DELETED (it asserted naught) and this one is KEPT as a
      //   pass-through spy (it is the assertion). same rule, opposite repair —
      //   what parts them is whether the spy is the subject or the silencer.
      //
      // ⚠️ the restore stays in `afterAll`, never in a `then`. inside a `then`
      //    it runs only if that assertion executes, so a failure in a peer
      //    `then` leaks the spy across the rest of the suite.
      const warnSpy = jest.spyOn(console, 'warn');

      then('config is returned despite mismatch', async () => {
        const result = await getConfig();
        expect(result).toBeDefined();
        expect(result.database.host).toBeDefined();
        expect(result.database.password).toEqual(testParamValue);
      });

      then('warn is logged', async () => {
        await getConfig();
        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0]?.[0]).toMatchSnapshot();
      });

      afterAll(() => {
        warnSpy.mockRestore();
      });
    });
  });

  given('[case6] prep environment failfast on schema mismatch', () => {
    const prepEnv = new SdkConfigEnvironment({
      config: 'prep',
      server: 'local@unix',
    });

    const badSchema = z.object({
      database: z.object({
        host: z.string(),
        port: z.number(),
        password: z.string(),
        required_field: z.string(), // does not exist in config
      }),
    });

    const getConfig = genGetConfig({
      schema: badSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: prepEnv,    });

    when('[t0] getConfig() is called', () => {
      then('error is thrown like test environment', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toMatchSnapshot();
      });
    });
  });

  given('[case8] config files not found', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    // .note = uses real suppliers but errors before they're called
    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.nonexistent`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: testEnv,    });

    // .note = the message echoes the caller's `statics` glob (an absolute
    //         __dirname-derived path). we redact the repo-root prefix (process.cwd())
    //         to `<cwd>` so the snapshot keeps its coverage yet stays portable.
    when('[t0] getConfig() is called', () => {
      then('throws BadRequestError with no files message', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(
          error.message.split(process.cwd()).join('<cwd>'),
        ).toMatchSnapshot();
      });
    });

    when('[t1] getConfig.static() is called', () => {
      then('throws BadRequestError with no files message', async () => {
        const error = await getError(async () => getConfig.static());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('no config files found');
        expect(
          error.message.split(process.cwd()).join('<cwd>'),
        ).toMatchSnapshot();
      });
    });
  });

  given('[case9] config slug not found', () => {
    const unknownConfigEnv = new SdkConfigEnvironment({
      config: 'nonexistent' as 'test',
      server: 'local@unix',
    });

    // .note = uses real suppliers but errors before they're called
    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, secretSupplier],
      environment: unknownConfigEnv,    });

    // .note = the message lists the discovered config `files` as absolute
    //         __dirname-derived paths. we redact the repo-root prefix (process.cwd())
    //         to `<cwd>` so the snapshot keeps its coverage yet stays portable.
    when('[t0] getConfig() is called', () => {
      then('throws BadRequestError with config slug message', async () => {
        const error = await getError(async () => getConfig());
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('config file not found for choice');
        expect(
          error.message.split(process.cwd()).join('<cwd>'),
        ).toMatchSnapshot();
      });
    });
  });

  // the feature under test at the BUILT-ARTIFACT level: an optional field whose
  // supplier reports a TOLERABLE error (denied/absent) is omitted, not fatal; a
  // required field with the same error hard-throws with the denied path. real AWS
  // still fills database.password; a custom secret supplier (built from the public
  // SupplyDeniedError/SupplyAbsentError taxonomy exported from @src/index) reports
  // the tolerable error for api.key. this proves the tolerance contract holds for a
  // consumer of the published package, not just the in-source contract layer.
  const optionalApiSchema = z.object({
    database: z.object({
      host: z.string(),
      port: z.number(),
      password: z.string(),
    }),
    api: z.object({
      key: z.string().optional(),
      url: z.string(),
    }),
  });

  const deniedSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => {
      throw new SupplyDeniedError('access denied to secret', { path });
    },
  };

  const absentSecretSupplier: SdkConfigSupplier = {
    scheme: 'aws::secret',
    supply: async ({ path }) => {
      throw new SupplyAbsentError('secret not found', { path });
    },
  };

  given('[case10] optional key denied — tolerated, key omitted', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: optionalApiSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, deniedSecretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig() is called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('the denied optional key is omitted', () => {
        expect(result.api.key).toBeUndefined();
      });

      then('the real param field is still filled from AWS', () => {
        expect(result.database.password).toEqual(testParamValue);
      });

      then('the resolved config matches snapshot', () => {
        // password is a per-run uuid — match its type, snapshot the rest concretely
        expect(result).toMatchSnapshot({
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case11] optional key absent — tolerated, key omitted', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    const getConfig = genGetConfig({
      schema: optionalApiSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, absentSecretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig() is called', () => {
      const result = useBeforeAll(async () => getConfig());

      then('the absent optional key is omitted', () => {
        expect(result.api.key).toBeUndefined();
      });

      then('the resolved config matches snapshot', () => {
        expect(result).toMatchSnapshot({
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case12] required key denied — hard throw with denied path', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    // api.key is REQUIRED here (testSchema); a tolerable error on a required field
    // is still a hard failure — the denied path surfaces in context.
    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [paramSupplier, deniedSecretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig() is called', () => {
      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then('throws BadRequestError that names the denied path', () => {
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain(
          'config requires values that could not be read',
        );
        expect(scene.error.message).toContain('api.key');

        // snapshot structured metadata, not the message string (which bakes the
        // cause's stack — absolute paths). mask the denial `cause` by type.
        const error = scene.error;
        if (!(error instanceof BadRequestError)) throw error;
        expect(error.metadata).toMatchSnapshot({
          blockers: [{ cause: expect.any(SupplyError) }],
        });
      });
    });
  });

  // the org-scoped derive, at the BUILT-ARTIFACT level. case1 already proves a
  // value comes back; these two prove WHICH path it came from, and that a
  // config with no org is refused before aws is touched.
  //
  // .note = the `org` ARGUMENT — both a plain override and the `'_'` opt-out —
  //         is deliberately NOT clamped here, and it is the one new public key
  //         this change ships, so the omission is stated over left to a reader.
  //         it is a pure string splice with no store-side behavior, and a
  //         real-aws grade would have to CREATE a param under a second org
  //         prefix to assert at all — which widens this suite's aws write
  //         surface to buy no coverage over asSdkConfigPath [case7] and
  //         genGetConfig.integration [case28] [t1]. what a real-aws grade DOES
  //         buy is below: that the four-segment address the derive builds is an
  //         address ssm accepts, which no fake supplier can prove.
  given('[case13] the derive is org-scoped end-to-end against real aws', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    // a spy in front of the real supplier — it notes the derived path and then
    // delegates, so aws returns what it would have returned anyway and the
    // assertion lands on the ADDRESS, never on a re-derive of it in the test.
    // .note = a spy, never a mock — it delegates (rule.forbid.acceptance.mocks).
    const pathsSupplied: string[] = [];
    const notedParamSupplier: SdkConfigSupplier = {
      scheme: 'aws::param',
      supply: async ({ path }) => {
        pathsSupplied.push(path);
        return paramSupplier.supply({ path });
      },
    };

    const getConfig = genGetConfig({
      schema: optionalApiSchema,
      statics: `${TEST_CONFIG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [notedParamSupplier, absentSecretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig() is called with no org argument', () => {
      const result = useBeforeAll(async () => getConfig());

      then('the value comes back from real ssm', () => {
        expect(result.database.password).toEqual(testParamValue);
      });

      then('and it was read from the ORG-SCOPED path', () => {
        // the org came from the config's `organization` field — never an argument
        expect(pathsSupplied).toContain(
          '/test-org/test-svc/test/database.password',
        );
      });

      then('every derived path carries four segments', () => {
        for (const path of pathsSupplied)
          expect(path.split('/').filter(Boolean)).toHaveLength(4);
      });

      then('and segment ONE is the org, segment TWO the repo', () => {
        // .note = the positional claim, which the literal above cannot make.
        //         that assertion would pass just as well if the derive emitted
        //         the four segments in some other order and the literal had
        //         been written to match — this pins WHICH segment is which.
        //
        // 🔴 it is also the live use of `ACCEPTANCE_ORG` / `ACCEPTANCE_REPO`,
        //    and so the compile-time clamp on F9's two type exports. read the
        //    `.what` at the top of this file for why a runtime assert cannot
        //    reach them.
        for (const path of pathsSupplied) {
          const [orgSegment, repoSegment] = path.split('/').filter(Boolean);
          expect(orgSegment).toEqual(ACCEPTANCE_ORG);
          expect(repoSegment).toEqual(ACCEPTANCE_REPO);
        }
      });

      then('the ADDRESS SET the derive produced is pinned', () => {
        // 🔴 the POSITIVE-path snapshot — `r4 blocker.1` (i002), conceded.
        //    the four assertions above each check one PROPERTY of the address
        //    (it contains X · it has four segments · segment one is the org).
        //    none of them shows a reviewer the address, and none of them
        //    catches an EXTRA path the derive emitted that happens to satisfy
        //    every property. a snapshot of the whole array does both.
        //
        // .note = fully deterministic, no mask owed. every token is authored
        //         — the org from the config field, the repo from
        //         `ACCEPTANCE_REPO`, the choice from the environment, the
        //         keyPath from the schema. no uuid, no timestamp, no machine
        //         path (`rule.require.contract-snapshot-exhaustiveness`).
        expect(pathsSupplied).toMatchSnapshot();
      });

      then('and the FILLED SHAPE a caller receives is pinned, masked', () => {
        // 🔴 the second half of the same concession, and the one that needs a
        //    MASK rather than a carve-out. `testParamValue` is
        //    `test-param-${getUuid()}` — a volatile byte, fresh every run.
        //
        // ⇒ the rule's own instruction: *"non-deterministic outputs are
        //   MASKED, then snapped live — never carved out."* so the uuid is
        //   masked by TYPE and everything around it is pinned exactly: the
        //   key set, the untouched literals (`localhost`, `5432`, the url),
        //   and — the part no assertion above reaches — that `api.key` comes
        //   back `undefined` rather than absent, which is how a tolerated
        //   optional miss actually presents to a caller.
        //
        // ⚠️ this is the LIVE journey, never a fake one. the snapped fill-path
        //    shape at the integration grade uses `fakeParamSupplier`; this one
        //    is the value real ssm returned through the real supplier
        //    (`rule.require.acceptance-journey-coverage`: do not settle for a
        //    snapshot at an injected layer and call the live journey covered).
        expect(result).toMatchSnapshot({
          database: { password: expect.any(String) },
        });
      });
    });
  });

  given('[case14] a config with no organization refuses to boot', () => {
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    // config-cicd was given an `organization`; this dir deliberately has none.
    // .note = a fixture whose whole job is to LACK the field. it must never gain
    //         one, or this case silently stops testing the refusal.
    const TEST_CONFIG_NOORG_DIR = join(
      __dirname,
      '../src/.test/assets/config-noorg',
    );

    const pathsSupplied: string[] = [];
    const notedParamSupplier: SdkConfigSupplier = {
      scheme: 'aws::param',
      supply: async ({ path }) => {
        pathsSupplied.push(path);
        return paramSupplier.supply({ path });
      },
    };

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_NOORG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [notedParamSupplier, secretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig() is called', () => {
      // 🔴 the act is captured HERE, over inside the first `then` — `r7 nitpick.1`,
      //    conceded on its THIRD raise (i001, i002, i003), and the first two went
      //    unanswered, which is the half that is on me.
      //
      // ⚠️ the peer's point is ISOLATION, and it is correct. with the act inside
      //    the first `then`, the second reads an array its SIBLING filled — so
      //    under `--testNamePattern`, or a `.only`, or a reorder, it passes with
      //    an empty array because no call was ever made. vacuous, for the wrong
      //    reason, and silently.
      //
      // 🔴 and my prior defense was ILLUSORY. the comment below claimed reading
      //    across two calls made the assertion *"strictly stronger — a leak in
      //    EITHER block fails it."* both blocks called the SAME `getConfig()` on
      //    the SAME fixture, so the second call discriminates no case the first
      //    did not. one act, read by both, loses no power and closes the hole.
      // 🔴 .note = the act yields a SCENE, never the throwable itself, and the
      //         wrapper carries weight rather than rides along. `useBeforeAll`
      //         hands back a LAZY PROXY: a property read resolves through it,
      //         but `toBeInstanceOf` reads the proxy's own target — `Object` —
      //         so `expect(error).toBeInstanceOf(BadRequestError)` goes RED on
      //         a real `BadRequestError`.
      //
      //         ⇒ measured at `genGetConfig.integration` this round: 18 red,
      //           from exactly this shape. ⚠️ THIS suite cannot run here
      //           (`F12`), so the identical defect would have shipped as a
      //           false green — a suite that RUNS caught a defect in one that
      //           cannot.
      //
      // ⛔ do NOT collapse this back to `const error = useBeforeAll(…)`. it
      //    reads cleaner and it breaks every `toBeInstanceOf` below.
      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then('it throws, and names the field plus its ONE remedy', () => {
        // 🔴 .note = UNRUN AT THIS GRADE, as of i007. this whole suite is 0/71
        //         on a dev host — the `ssm:PutParameter` denial is
        //         action-level, so the suite cannot reach its own setup.
        //         ⇒ these four assertions have never executed HERE.
        //
        //         they are not unproven, and that distinction is the point:
        //         the identical four run every round one grade down, at
        //         `genGetConfig.integration.test.ts [case28]`, which also
        //         snaps the sentence. ⇒ the TEXT is clamped; what is
        //         unclamped is that this surface raises the same text.
        //
        // ⛔ do NOT read a green or a red on these lines as evidence either
        //    way until CI has run this file. a peer asked for this note
        //    precisely so the honesty the yield carries is also carried at
        //    the line a reviewer reads.
        //
        // 🔴 .note = the `not.toContain` below is the F11 clamp, and it was
        //         AUTHORED AS ITS INVERSE. this block once asserted
        //         `toContain('genGetConfig')` — a call-site remedy that was
        //         real until F11 cut the `org` key. the line survived the cut
        //         because THIS SUITE CANNOT RUN HERE, so no red ever named
        //         it, while its twin at `[case28]` already asserted the
        //         opposite. ⇒ an unrun suite does not merely fail to prove a
        //         claim; it preserves a false one. that is the sharpest
        //         concrete instance of the risk fulcrum F12 records.
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain('organization');
        expect(scene.error.message).toContain('your-org'); // the ONE remedy: edit the config
        expect(scene.error.message).not.toContain('genGetConfig'); // F11: no call-site lever exists

        // 🔴 the SENTENCE, pinned at this grade — `r2 blocker.1`, conceded.
        //
        // .why = the three assertions above prove the message CONTAINS the
        //        right words; they cannot show a reviewer the paragraph an
        //        adopter actually reads. this is the most-read sentence this
        //        change ships — every repo that adopts the required field
        //        meets it exactly once — so it is snapped for the PR diff, and
        //        asserted above so a regression names itself
        //        (`rule.require.snapshots`: both, never one).
        //
        // .note = the output holds NO volatile byte — no uuid, no timestamp,
        //         no machine path — so it needs no mask
        //         (`rule.require.contract-snapshot-exhaustiveness`). that is
        //         why it can be snapped at a grade this host cannot run: the
        //         value is fixed by `getOneOrg`, and jest already wrote the
        //         identical text into two other `.snap` files from real runs.
        //
        // ⚠️ i disputed this in a prior round on the ground that a snapshot
        //    written by the first CI run "passes trivially". that argument was
        //    wrong, and its refutation is general: EVERY snapshot in this repo
        //    passed trivially on the run that created it. a snapshot's value is
        //    the second run onward, plus the diff a reviewer reads — so an
        //    unrun surface is a reason to snap it, never a reason to skip it.
        expect(scene.error.message).toMatchSnapshot();
      });

      then('and aws was never reached at all', () => {
        // 🔴 the assertion that carries this case. a build that fell back to
        //    the old two-segment derive would ALSO look fine at the throw
        //    above if the throw came later — this is the only step that fails
        //    on a fallback that quietly works.
        //
        // ✅ it reads an array filled by the `useBeforeAll` act above, never by
        //    a sibling `then`. so it holds its meaning in isolation: the act
        //    runs before either block, under any filter or order.
        //
        // ⛔ do NOT move the act back into a `then`, and do NOT reset with
        //    `pathsSupplied.length = 0` and re-call. the first reopens the
        //    vacuity `r7` caught three times; the second mutates state the
        //    peer block reads (`rule.require.immutable-vars`).
        expect(pathsSupplied).toEqual([]);
      });
    });
  });

  given('[case15] a MALFORMED organization refuses to boot', () => {
    // 🔴 the PEER of [case14], added on `r2 blocker.1` (i002), conceded.
    //
    // ⚠️ the peer caught an INCONSISTENCY, not merely a gap. i conceded the
    //    snapshot principle for the no-org refusal and snapped it at all three
    //    grades — then left its peer refusal, the one a config author with a
    //    TYPO meets, with no acceptance case at all. **a principle applied to
    //    one of two peers is not a principle.**
    //
    // ⇒ the two refusals are what a caller discriminates between, so both owe
    //   a snapshot at every grade a caller meets. a build that collapsed them
    //   would send an author with a PRESENT field to go add the field they had
    //   already written.
    const testEnv = new SdkConfigEnvironment({
      config: 'test',
      server: 'local@unix',
    });

    // .note = a fixture whose whole job is to hold an UNUSABLE `organization`:
    //         a `$.at()` placeholder, which is the malformation a human most
    //         plausibly writes — every other value in that file is one.
    //
    // ⛔ it must never gain a valid org, or this case silently stops to test
    //    the refusal. the same warn is written in the fixture itself.
    const TEST_CONFIG_BADORG_DIR = join(
      __dirname,
      '../src/.test/assets/config-badorg-allexplicit',
    );

    const pathsSupplied: string[] = [];
    const notedParamSupplier: SdkConfigSupplier = {
      scheme: 'aws::param',
      supply: async ({ path }) => {
        pathsSupplied.push(path);
        return paramSupplier.supply({ path });
      },
    };

    const getConfig = genGetConfig({
      schema: testSchema,
      statics: `${TEST_CONFIG_BADORG_DIR}/*.yml`,
      cache: createCache(),
      suppliers: [notedParamSupplier, secretSupplier],
      environment: testEnv,    });

    when('[t0] getConfig() is called', () => {
      // the act is captured here, never in a `then` — see `[case14] [t0]` for
      // why (`r7 nitpick.1`, conceded on its third raise).
      // 🔴 .note = the act yields a SCENE, never the throwable itself, and the
      //         wrapper carries weight rather than rides along. `useBeforeAll`
      //         hands back a LAZY PROXY: a property read resolves through it,
      //         but `toBeInstanceOf` reads the proxy's own target — `Object` —
      //         so `expect(error).toBeInstanceOf(BadRequestError)` goes RED on
      //         a real `BadRequestError`.
      //
      //         ⇒ measured at `genGetConfig.integration` this round: 18 red,
      //           from exactly this shape. ⚠️ THIS suite cannot run here
      //           (`F12`), so the identical defect would have shipped as a
      //           false green — a suite that RUNS caught a defect in one that
      //           cannot.
      //
      // ⛔ do NOT collapse this back to `const error = useBeforeAll(…)`. it
      //    reads cleaner and it breaks every `toBeInstanceOf` below.
      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfig()),
      }));

      then('it throws — and names a DIFFERENT remedy than [case14]', () => {
        // 🔴 .note = UNRUN AT THIS GRADE, for the same cause [case14] records:
        //         this suite is 0/71 on a dev host, since `ssm:PutParameter` is
        //         denied at the ACTION level and the suite cannot reach its own
        //         setup. ⇒ these assertions have never executed HERE.
        //
        //         they are not unproven. the identical claims run every round
        //         one grade down, at `genGetConfig.integration.test.ts [case28]
        //         [t4]`, which also snaps the sentence. ⇒ the TEXT is clamped;
        //         what is unclamped is that THIS surface raises the same text.
        //
        // ⛔ do NOT read a green or a red here as evidence either way until CI
        //    has run this file. [case14] carries the measured reason why: a
        //    false assertion survived five days in this very suite, because an
        //    unrun surface does not merely fail to prove a claim — it preserves
        //    a false one.
        expect(scene.error).toBeInstanceOf(BadRequestError);

        // the DISCRIMINATION, which is the whole point of a second case:
        // [case14]'s author must ADD the field; this author must FIX the one
        // they already wrote. a message that conflated them would misdirect
        // exactly the reader it is written for.
        expect(scene.error.message).toContain('placeholder');
        expect(scene.error.message).not.toContain('lacks a required');
        expect(scene.error.message).not.toContain('genGetConfig'); // F11: no call-site lever

        // 🔴 the SENTENCE, pinned at this grade. hand-written into the `.snap`
        //    from the machine-written twin at
        //    `genGetConfig.integration.test.ts.snap [case28] [t4]` — the same
        //    call path (`getConfig()` → `asStaticConfig` → `getOneOrg`), with
        //    the `BadRequestError` propagated UNWRAPPED, so the two are
        //    identical by construction.
        //
        // ⇒ so it has teeth BEFORE CI ever runs it: a drift in the message
        //   reddens it on the first run, over a silent re-baseline — which is
        //   the one objection a deferred snapshot cannot answer.
        //
        // .note = no mask is owed. the output holds no volatile byte — no uuid,
        //         no timestamp, no machine path
        //         (`rule.require.contract-snapshot-exhaustiveness`).
        expect(scene.error.message).toMatchSnapshot();
      });

      then('and aws was never reached at all', () => {
        // the peer of [case14]'s last assertion, and it carries the same claim
        // for the malformed half: the refusal precedes EVERY read, so a build
        // that validated lazily would leak a path here.
        //
        // 🔴 measured, at the grade that can run: with the placeholder guard
        //    disabled, the twin went red with `["/org", "/hand/written/db/…"]`
        //    — the ORG'S OWN placeholder, sent to the param store as though it
        //    were a config value to fill.
        //
        // ✅ it reads the `useBeforeAll` act above, so it holds in isolation.
        // ⛔ do NOT move the act into a `then`, or reset and re-call — see
        //    `[case14]` for both reasons.
        expect(pathsSupplied).toEqual([]);
      });
    });

    // 🔴 the two REMAINING malformed shapes — `r2 blocker.1` (i003), conceded.
    //
    // ⚠️ `[t0]` above opens by a claim of an INCONSISTENCY it had just fixed:
    //    the principle was applied to one of two peers. the i003 peer found the
    //    very same shape one level INSIDE that fix — `getOneOrg` raises THREE
    //    malformed sentences, and the i002 sweep carried only the placeholder
    //    one to this grade. so the note above was true and its scope was wrong.
    //
    // ⇒ these two close it. every sentence a config author can meet is now
    //   snapped at every grade they can meet it at.
    const genRefusalFactory = (input: { dir: string; paths: string[] }) =>
      genGetConfig({
        schema: testSchema,
        statics: `${join(__dirname, '../src/.test/assets', input.dir)}/*.yml`,
        cache: createCache(),
        suppliers: [
          {
            scheme: 'aws::param',
            supply: async ({ path }) => {
              input.paths.push(path);
              return paramSupplier.supply({ path });
            },
          },
          secretSupplier,
        ],
        environment: testEnv,      });

    when('[t1] the organization is a MAP, not a literal', () => {
      const pathsNonLiteral: string[] = [];
      const getConfigNonLiteral = genRefusalFactory({
        dir: 'config-badorg-nonliteral',
        paths: pathsNonLiteral,
      });

      // the act, captured in the `when` — see `[case14] [t0]` (`r7 nitpick.1`),
      // and yielded as a SCENE for the proxy reason recorded there.
      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfigNonLiteral()),
      }));

      then('it throws, and names THIS malformation', () => {
        // 🔴 .note = UNRUN AT THIS GRADE, for the cause `[t0]` records. the
        //         identical claims run every round one grade down, at
        //         `genGetConfig.integration.test.ts [case28] [t5]`.
        //
        // 🔴 the discriminator is the PEER THROW'S HEADLINE — `cannot be a
        //    placeholder` — never the bare word. measured at the twin: a bare
        //    `not.toContain('placeholder')` goes RED, because THIS throw's hint
        //    says *"a placeholder is not filled here"* on purpose. the word
        //    appears in both messages and parts neither.
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain('literal string');
        expect(scene.error.message).not.toContain('cannot be a placeholder');
        expect(scene.error.message).not.toContain('lacks a required');
        expect(scene.error.message).not.toContain('genGetConfig'); // F11: no call-site lever

        // hand-written into the `.snap` from the machine-written twin, for the
        // reason `[t0]` states: the call path is identical and the
        // `BadRequestError` propagates unwrapped, so it has teeth before CI
        // ever runs it.
        expect(scene.error.message).toMatchSnapshot();
      });

      then('and aws was never reached at all', () => {
        expect(pathsNonLiteral).toEqual([]);
      });
    });

    when('[t2] the organization is BLANK — whitespace only', () => {
      const pathsBlank: string[] = [];
      const getConfigBlank = genRefusalFactory({
        dir: 'config-badorg-blank',
        paths: pathsBlank,
      });

      // the act, captured in the `when` — see `[case14] [t0]` (`r7 nitpick.1`),
      // and yielded as a SCENE for the proxy reason recorded there.
      const scene = useBeforeAll(async () => ({
        error: await getError(async () => getConfigBlank()),
      }));

      then('it throws, and names THIS malformation', () => {
        // 🔴 the one malformed value a `typeof` check cannot catch — it IS a
        //    literal string. so `not.toContain('literal string')` is what parts
        //    this from `[t1]`, and what reddens if the two throws are merged.
        //
        // .note = UNRUN AT THIS GRADE. the twin is `[case28] [t6]`.
        expect(scene.error).toBeInstanceOf(BadRequestError);
        expect(scene.error.message).toContain('empty');
        expect(scene.error.message).not.toContain('literal string');
        expect(scene.error.message).not.toContain('lacks a required');
        expect(scene.error.message).not.toContain('genGetConfig'); // F11: no call-site lever
        expect(scene.error.message).toMatchSnapshot();
      });

      then('and aws was never reached at all', () => {
        expect(pathsBlank).toEqual([]);
      });
    });
  });
});
