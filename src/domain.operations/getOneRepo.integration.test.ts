import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { join } from 'node:path';
import { getOneRepo } from './getOneRepo';

const TEST_ASSETS_DIR = join(__dirname, '../.test/assets');

/**
 * .what = swap the absolute repo root out of an error message, for a snapshot
 * .why  = these errors carry an ABSOLUTE path on purpose — oncall needs the
 *         real location — but an absolute path is host-specific, so a raw
 *         snapshot of one passes here and fails on every other machine
 *         (`rule.require.hermetic-tests`).
 *
 * 🔴 this was not a live defect until this round, and that is the point. the
 *    `$RESNAP` flag was unquoted, so `--updateSnapshot` was appended on every
 *    run and NO snapshot in this repo could fail — a host-specific snapshot was
 *    simply rewritten each time. the quote repair makes snapshots enforce, and
 *    it makes this latent defect live.
 *
 * ⛔ do NOT repair this by a relative path in the ERROR. the message is a
 *    production surface and the absolute path is the useful half of it; the
 *    normalization belongs in the test, where the host-dependence is.
 *
 * 🔴 .note = the marker is `<cwd>`, and it was `<repo>` until `r6 nitpick.1`
 *         (i003), conceded. six other snapshot sites in this repo redact the
 *         SAME value — `process.cwd()` — and every one of them wrote `<cwd>`.
 *
 *         ⇒ two words for one concept (`rule.require.ubiqlang`), and the
 *           minority word was the inaccurate one: what is redacted is the
 *           process cwd, which this suite deliberately points at fixture dirs
 *           that are not a repo root at all.
 *
 * ⛔ do NOT reintroduce a second marker. if a later site redacts a value OTHER
 *    than `process.cwd()`, give it its own word — the defect here was one value
 *    under two names, never two values under one.
 */
const asPortableMessage = (input: { message: string }): string =>
  input.message.split(process.cwd()).join('<cwd>');

describe('getOneRepo', () => {
  given('[case1] the config declares `repository`', () => {
    when('[t0] the field holds a plain name', () => {
      then('the declared value wins, and no file is read', () => {
        const result = getOneRepo({
          static: { repository: 'my-custom-service' },
          cwd: null,
        });
        expect(result).toEqual('my-custom-service');
      });
    });
  });

  given('[case2] no `repository`, package.json with name field', () => {
    when('[t0] the config declares none', () => {
      then('the package.json `name` is the ergonomic default', () => {
        const result = getOneRepo({
          static: {},
          cwd: join(TEST_ASSETS_DIR, 'fake-repo'),
        });
        expect(result).toEqual('test-repo-name');
      });
    });
  });

  given('[case3] no `repository`, and no package.json', () => {
    when('[t0] called in directory without package.json', () => {
      then('throws BadRequestError', async () => {
        // 🔴 the cwd is a path UNDER the fixture dir, never `/tmp/…`, and the
        //    message is normalized like every other snapshot in this suite.
        //
        // ⇒ it read `/tmp/nonexistent-dir` and skipped `asPortableMessage`,
        //   which baked a POSIX-absolute path into the snapshot: green on the
        //   host that wrote it, red on any other (`rule.require.hermetic-tests`).
        //   the defect was invisible while `$RESNAP` was unquoted — the
        //   snapshot was silently rewritten on every run — so the quote repair
        //   is what made a peer able to see it at all.
        const error = await getError(async () =>
          getOneRepo({
            static: {},
            cwd: join(TEST_ASSETS_DIR, 'no-such-dir'),
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('package.json not found');
        expect(asPortableMessage({ message: error.message })).toMatchSnapshot();
      });
    });
  });

  given('[case4] real package.json in project root', () => {
    when('[t0] called with a null cwd (uses process.cwd)', () => {
      then('returns sdk-config', () => {
        const result = getOneRepo({ static: {}, cwd: null });
        expect(result).toEqual('sdk-config');
      });
    });
  });

  given('[case5] package.json with invalid json', () => {
    when('[t0] called in directory with malformed package.json', () => {
      then('throws BadRequestError with parse context', async () => {
        const error = await getError(async () =>
          getOneRepo({
            static: {},
            cwd: join(TEST_ASSETS_DIR, 'invalid-package'),
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('package.json parse failed');
        expect(asPortableMessage({ message: error.message })).toMatchSnapshot();
      });
    });
  });

  given('[case7] package.json cannot be READ, and it is not absent', () => {
    when(
      '[t0] the path resolves to a directory, so readFileSync throws EISDIR',
      () => {
        then('the error names a READ failure, never a syntax one', async () => {
          // 🔴 the clamp on the read/parse seam. wrap the read and the parse in
          //    ONE try and a single catch must GUESS which failed — by an
          //    allowlist of one: `ENOENT` → "not found", every other errno →
          //    "parse failed — check package.json syntax".
          //
          // ⇒ an EACCES, an EIO, or this EISDIR then sends a reader to edit
          //   json that was NEVER OPENED. that is the misattributed-cause shape
          //   `rule.forbid.failhide` bars: it rethrows, and it lies about why.
          //
          // ⛔ do NOT delete this case as redundant with [case3] (ENOENT) or
          //    [case5] (parse). it is the ONLY case that reaches the third
          //    branch, so without it a regression that re-merges the two try
          //    blocks passes the whole suite green.
          const error = await getError(async () =>
            getOneRepo({
              static: {},
              cwd: join(TEST_ASSETS_DIR, 'unreadable-package'),
            }),
          );
          expect(error).toBeInstanceOf(BadRequestError);

          // the branch is named by its OWN cause
          expect(error.message).toContain('package.json could not be read');

          // 🔴 and it must NOT borrow the syntax verdict — this is the assertion
          //    that goes red if the two try blocks are ever merged back
          expect(error.message).not.toContain('parse failed');
          expect(error.message).not.toContain('check package.json syntax');

          // the sentence a user meets, put where a reviewer can read it
          expect(
            asPortableMessage({ message: error.message }),
          ).toMatchSnapshot();
        });
      },
    );
  });

  given('[case11] a BLANK `repository` declared, package.json valid', () => {
    when('[t0] the declared value is the empty string', () => {
      then('it throws, over a swap to package.json `name`', async () => {
        // 🔴 under a truthy `if (input.static.repository)` this falls through
        //    and the caller gets `test-repo-name` — a repo they never asked
        //    for, from the very source their declaration was there to replace.
        //    a silent substitution, and this case is what bars it.
        //
        // ⚠️ the cwd matters: it points at a fixture WITH a readable
        //    package.json, so a regression to the truthy check returns a real
        //    name and the case reddens on the swap rather than on a read
        //    error. a `cwd: null` here would pass for the wrong reason.
        const error = await getError(async () =>
          getOneRepo({
            static: { repository: '' },
            cwd: join(TEST_ASSETS_DIR, 'fake-repo'),
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('repo is empty');
      });
    });

    when('[t1] the field is ABSENT — the state `undefined` names', () => {
      then('the default is intact. ONLY blankness throws', () => {
        // ⛔ do NOT drop this as a duplicate of [case2]. it is the OTHER half
        //    of the same seam: [t0] proves blank throws, and this proves the
        //    repair did not take the live default down with it. without it, a
        //    guard widened past `undefined` passes [t0] and silently kills
        //    every repo that relies on the package.json default.
        expect(
          getOneRepo({
            static: {},
            cwd: join(TEST_ASSETS_DIR, 'fake-repo'),
          }),
        ).toEqual('test-repo-name');
      });
    });
  });

  given('[case10] a `repository` that holds wrapper whitespace', () => {
    when('[t0] it is padded on both sides', () => {
      then('the pad is stripped, exactly as the org is', () => {
        // 🟠 the repo half of the same peer nitpick. the `.trim()` was in the
        //    regex chain and in no doc and in no test, so a later author could
        //    read it as incidental and drop it — and in `asOrgSegment` that
        //    drop regresses a real clamp.
        expect(
          getOneRepo({ static: { repository: '  svc-x  ' }, cwd: null }),
        ).toEqual('svc-x');
      });

      then('an INNER space survives — only the wrapper goes', () => {
        expect(
          getOneRepo({ static: { repository: ' my service ' }, cwd: null }),
        ).toEqual('my service');
      });
    });
  });

  given('[case8] package.json parses cleanly into a NON-object', () => {
    when('[t0] its root is the json literal `null`', () => {
      then('it throws, over a raw TypeError from a `.name` read', async () => {
        // 🔴 `null` is VALID json, so the parse catch never fires and the file
        //    reaches the name read intact. before the guard, `packageJson.name`
        //    threw `TypeError: Cannot read properties of null` — no path, no
        //    hint, no `HelpfulError` context (`rule.require.failloud`).
        //
        // ⛔ do NOT merge this with [case5]. that case proves a parse FAILURE
        //    is named as one; this proves a parse SUCCESS whose result is the
        //    wrong kind is ALSO named as itself, rather than dressed in either
        //    the syntax verdict or the absent-name one.
        const error = await getError(async () =>
          getOneRepo({
            static: {},
            cwd: join(TEST_ASSETS_DIR, 'nonobject-package'),
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('package.json is not a json object');

        // it must NOT wear the syntax verdict — the file parsed cleanly
        expect(error.message).not.toContain('parse failed');

        // nor the absence verdict — the FILE is at fault, never a field
        expect(error.message).not.toContain('name field is absent');

        expect(asPortableMessage({ message: error.message })).toMatchSnapshot();
      });
    });
  });

  given('[case9] package.json declares a `name` of the wrong kind', () => {
    when('[t0] the name field holds a number', () => {
      then('the error names the KIND, never an absence', async () => {
        // 🔴 the extant guard was `if (!packageJson.name)`, and `42` is truthy,
        //    so `name: 42` fell THROUGH it into `asRepoSegment`, whose
        //    `.replace` threw a raw TypeError. the identical unhelpful-crash
        //    class as [case8], one line down.
        //
        // ⚠️ and the lazy repair — to widen `!packageJson.name` into a typeof
        //    check — reports a field that IS present as "absent", which sends
        //    a reader to ADD a field they already wrote. that is the
        //    misattributed cause the r2 read/parse split exists to bar, so the
        //    two are separate throws on purpose.
        const error = await getError(async () =>
          getOneRepo({
            static: {},
            cwd: join(TEST_ASSETS_DIR, 'wrongkind-name-package'),
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('repo must be a literal string');
        expect(error.message).not.toContain('absent');

        // 🔴 and it must name WHICH source supplied the bad value. the same
        //    sentence is thrown for a bad `repository` in the config, so
        //    without this the reader is told the shape and not the file.
        expect(error.message).toContain('the `name` field in package.json');

        expect(asPortableMessage({ message: error.message })).toMatchSnapshot();
      });
    });
  });

  given('[case12] package.json declares NO `name` key at all', () => {
    when('[t0] the field is genuinely absent', () => {
      then('the error says ABSENT, and tells you to ADD it', async () => {
        // 🔴 this throw shipped UNTESTED and UNSNAPPED. two peer lanes caught
        //    it in the same round — one on coverage, one on the text — and
        //    both are right: an error a human can reach, whose message no
        //    reviewer has ever seen in a diff, is an error nobody has read.
        const error = await getError(async () =>
          getOneRepo({
            static: {},
            cwd: join(TEST_ASSETS_DIR, 'noname-package'),
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('name field is absent');

        // the ADD remedy is correct HERE, and only here
        expect(error.message).toContain('add a name field');

        expect(asPortableMessage({ message: error.message })).toMatchSnapshot();
      });
    });
  });

  given('[case13] package.json declares a `name` that is BLANK', () => {
    when('[t0] the field is present and whitespace-only', () => {
      then('the error says EMPTY, never absent', async () => {
        // 🔴 the FOURTH straddled check on this route. one guard reported both
        //    states as "absent", defended as *"ONE error, because one remedy
        //    fixes both"* — and no remedy fixes both. a reader sent to
        //    *"add name field"* opens package.json and finds the field already
        //    there, blank.
        //
        // ⛔ do NOT re-merge these two branches. this assertion pair is the
        //    clamp: `not.toContain('absent')` reddens on a merge back, and
        //    [case12]'s `toContain('absent')` reddens on a merge the other way.
        //    neither alone is enough — one guards each direction.
        const error = await getError(async () =>
          getOneRepo({
            static: {},
            cwd: join(TEST_ASSETS_DIR, 'blankname-package'),
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('repo is empty');

        // it must NOT wear the absence verdict — the field IS there
        expect(error.message).not.toContain('absent');

        // nor send the reader to add what already exists
        expect(error.message).not.toContain('add a name field');

        // and it must name WHICH source held the blank
        expect(error.message).toContain('the `name` field in package.json');

        expect(asPortableMessage({ message: error.message })).toMatchSnapshot();
      });
    });
  });

  given(
    '[case6] a `repository` with wrapper slashes — the org/repo symmetry',
    () => {
      when('[t0] the value is typed with a slash on each end', () => {
        then('the wrapper slashes are trimmed, exactly as the org is', () => {
          // 🔴 both segments carry the same trim, and this pins the repo half.
          //    with no trim here, `'/svc-x/'` derives `/org//svc-x/prod/…`
          //    while the identical org typo self-heals.
          //
          // ⇒ both segments are spliced raw into one path and both are
          //   hand-typed into a config, so a trim on one and not the other is
          //   a real break in a symmetry the design states outright.
          expect(
            getOneRepo({ static: { repository: '/svc-x/' }, cwd: null }),
          ).toEqual('svc-x');
        });

        then(
          'a value that is ONLY slashes throws, over a blank splice',
          async () => {
            // ⚠️ `''` is caught by the blank guard ([case11]) before the trim
            //    ever runs. `'/'` passes that guard, so it does reach the trim
            //    and would strip down to a blank segment.
            //
            // ⛔ do NOT drop this guard as redundant with the blank check. they
            //    cover different inputs, and without this one the trim MOVES
            //    the defect it was added to remove one level down.
            const error = await getError(async () =>
              getOneRepo({ static: { repository: '/' }, cwd: null }),
            );
            expect(error).toBeInstanceOf(BadRequestError);
            expect(error.message).toContain('repo is empty');

            // .note = the snapshot puts the WORDING a consumer meets into the pr
            //         diff, so a reviewer can vibecheck the hint rather than take
            //         a substring's word for it (`rule.require.snapshots`).
            //         ⇒ this now ENFORCES: the `$RESNAP` flag was unquoted, so
            //           `--updateSnapshot` was appended on every run and no
            //           snapshot in this repo could ever fail. fixed in
            //           `package.json` this round, and proven by a probe.
            expect(error.message).toMatchSnapshot();
          },
        );
      });
    },
  );
});
