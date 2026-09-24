import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { SdkConfigUri } from '../domain.objects/SdkConfigUri';
import { asSdkConfigPath } from './asSdkConfigPath';

describe('asSdkConfigPath', () => {
  given('[case1] uri with null explicitPath (auto-derive)', () => {
    const uri = new SdkConfigUri({ scheme: 'aws::param', explicitPath: null });

    when('[t0] path is derived', () => {
      then('returns /{org}/{repo}/{choice}/{keyPath}', () => {
        const result = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
          keyPath: 'database.password',
        });
        expect(result).toEqual('/ahbode/svc-x/prod/database.password');
      });

      then('the derived path carries FOUR segments, always', () => {
        // .note = the count is the clamp. a build that dropped the org, or
        //         spliced a blank for it, still produces a plausible string —
        //         only the arity says which one you got.
        const result = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
          keyPath: 'database.password',
        });
        expect(result.split('/').filter(Boolean)).toHaveLength(4);
      });

      then('the org LEADS the path, over trails the repo', () => {
        const result = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
          keyPath: 'database.password',
        });
        expect(result.startsWith('/ahbode/')).toEqual(true);
      });
    });
  });

  given('[case2] uri with explicit path', () => {
    const uri = new SdkConfigUri({
      scheme: 'aws::param',
      explicitPath: '/shared/db/pass',
    });

    when('[t0] path is derived', () => {
      then('returns explicit path directly', () => {
        const result = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
          keyPath: 'database.password',
        });
        expect(result).toEqual('/shared/db/pass');
      });

      then('the org is NEVER spliced into an explicit path', () => {
        // .note = an explicit path is the author's own address. to prepend an
        //         org would re-point a path they wrote by hand — the one
        //         regression that breaks every extant repo.
        const result = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prod',
          keyPath: 'database.password',
        });
        expect(result).not.toContain('ahbode');
      });
    });
  });

  given('[case3] empty keyPath with auto-derive', () => {
    const uri = new SdkConfigUri({ scheme: 'aws::param', explicitPath: null });

    when('[t0] path is derived', () => {
      then('throws BadRequestError', async () => {
        const error = await getError(async () =>
          asSdkConfigPath({
            uri,
            org: 'ahbode',
            repo: 'svc-x',
            choice: 'prod',
            keyPath: '',
          }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('empty keyPath');
      });

      then(
        'the error carries the org, so the whole address is legible',
        async () => {
          // .note = oncall reads one line. every segment that would have been
          //         spliced belongs in it.
          const error = await getError(async () =>
            asSdkConfigPath({
              uri,
              org: 'ahbode',
              repo: 'svc-x',
              choice: 'prod',
              keyPath: '',
            }),
          );
          expect(error.message).toContain('ahbode');

          // .note = a `toContain` cannot catch a drift in the words themselves,
          //         and this message is exactly what the diff claims is "legible
          //         oncall" — so the claim is put in a form a reviewer can read
          //         (`rule.require.snapshots`). it ENFORCES as of the `$RESNAP`
          //         quote repair this round.
          expect(error.message).toMatchSnapshot();
        },
      );
    });
  });

  given('[case4] nested key paths', () => {
    const uri = new SdkConfigUri({ scheme: 'aws::secret', explicitPath: null });

    when('[t0] path is derived with deeply nested keyPath', () => {
      then('preserves dots in keyPath', () => {
        const result = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-api',
          choice: 'test',
          keyPath: 'services.stripe.api.secretKey',
        });
        expect(result).toEqual(
          '/ahbode/svc-api/test/services.stripe.api.secretKey',
        );
      });

      then(
        'an aws::secret is org-scoped too — the derive reads no scheme',
        () => {
          // .note = an org namespace is a property of the REPO, never of the
          //         store it reads from. a scheme carve-out would be the only
          //         `if` in this operation, and the wish never asked for one.
          const result = asSdkConfigPath({
            uri,
            org: 'ahbode',
            repo: 'svc-api',
            choice: 'test',
            keyPath: 'services.stripe.api.secretKey',
          });
          expect(result.split('/').filter(Boolean)).toHaveLength(4);
        },
      );
    });
  });

  given('[case5] different choice values', () => {
    const uri = new SdkConfigUri({ scheme: 'aws::param', explicitPath: null });

    when('[t0] choice is test', () => {
      then('includes test in path', () => {
        const result = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'test',
          keyPath: 'db.host',
        });
        expect(result).toEqual('/ahbode/svc-x/test/db.host');
      });
    });

    when('[t1] choice is prep', () => {
      then('includes prep in path', () => {
        const result = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-x',
          choice: 'prep',
          keyPath: 'db.host',
        });
        expect(result).toEqual('/ahbode/svc-x/prep/db.host');
      });
    });
  });

  given(
    '[case6] two orgs, one repo name — the collision this exists to bar',
    () => {
      const uri = new SdkConfigUri({
        scheme: 'aws::param',
        explicitPath: null,
      });

      when('[t0] two orgs derive the same repo, choice, and key', () => {
        // .note = derived once, read by both assertions below. the two `then`s
        //         grade two different properties of ONE pair of paths — that
        //         they differ, and where each landed — so a re-derive per block
        //         would restate the setup rather than widen the coverage
        //         (`rule.forbid.redundant-expensive-operations`).
        const ahbode = asSdkConfigPath({
          uri,
          org: 'ahbode',
          repo: 'svc-notifications',
          choice: 'prod',
          keyPath: 'database.password',
        });
        const acme = asSdkConfigPath({
          uri,
          org: 'acme',
          repo: 'svc-notifications',
          choice: 'prod',
          keyPath: 'database.password',
        });

        then('their paths differ, so one store holds both', () => {
          // .note = this is the whole motive, in one assertion. before the org
          //         segment these two were byte-identical, and the second repo
          //         read the first repo's secret.
          expect(ahbode).not.toEqual(acme);
        });

        then('and each is namespaced under its own org', () => {
          expect(ahbode).toEqual(
            '/ahbode/svc-notifications/prod/database.password',
          );
          expect(acme).toEqual(
            '/acme/svc-notifications/prod/database.password',
          );
        });
      });
    },
  );

  given(`[case7] the '_' placeholder org — the only opt-out`, () => {
    const uri = new SdkConfigUri({ scheme: 'aws::param', explicitPath: null });

    when(`[t0] org is '_'`, () => {
      // derived once; both assertions below grade the same string
      const result = asSdkConfigPath({
        uri,
        org: '_',
        repo: 'svc-x',
        choice: 'prep',
        keyPath: 'db.host',
      });

      then('it lands in its OWN namespace, never back in a shared pool', () => {
        // .note = this is the F5 clamp at the derive. `_` is a third namespace,
        //         over a fall back to the un-namespaced pool a repo just left.
        expect(result).toEqual('/_/svc-x/prep/db.host');
      });

      then('and it still carries four segments, like every other org', () => {
        expect(result.split('/').filter(Boolean)).toHaveLength(4);
      });

      then('the SHAPE is pinned, so a reviewer reads F5 in the diff', () => {
        // 🔴 `r4 nitpick.1` (i003), conceded. the `_` opt-out is the escape
        //    hatch every awkward cell in the catalog routes through, and it was
        //    the one journey whose derived shape had no snapshot ANYWHERE.
        //
        // ⚠️ the two assertions above are a `toEqual` and a length count. both
        //    are real, and neither puts the path in a **PR diff** — so a
        //    reviewer could not vibecheck the F5 verdict (its own namespace,
        //    four segments, never a fall back to the shared pool) without a run.
        //
        // .note = the acceptance grade stays uncovered ON PURPOSE, and the peer
        //         granted it: to assert `_` there would mean a real param
        //         written under a SECOND org prefix, which widens the live-aws
        //         write surface for one alterpath. `[case13]` in the blackbox
        //         suite records that carve-out. ⇒ what was missed is a snapshot
        //         at a grade that already RUNS, which costs a line.
        expect(result).toMatchSnapshot();
      });
    });
  });

  given('[case8] a repo that already carries an org — the prior hack', () => {
    // ⇒ catalog: `1.vision.experience.case=_.md`, cell `h2` on axis H
    //   (repo-shape = `org-doctored`). itemized rather than demoed — it is an
    //   ALTERPATH with a workable remedy (drop the hack), which the rule's own
    //   caveat permits. the axis was added by the `r5` peer review.
    const uri = new SdkConfigUri({
      scheme: 'aws::param',
      explicitPath: null,
    });

    when('[t0] both the org AND the repo supply an org segment', () => {
      // derived once; both assertions below grade the same string
      const result = asSdkConfigPath({
        uri,
        org: 'ahbode',
        repo: 'ahbode/svc-x',
        choice: 'prod',
        keyPath: 'database.password',
      });

      then('the org lands TWICE — no de-duplication is attempted', () => {
        // 🔴 the vision's own edgecase row, and it asks for the ABSENCE of code:
        //    *"sdk-config cannot tell an org-doctored `repo` from a real
        //    one, so it does not try."* a repo could reach the target shape
        //    before this behavior with `repo: 'ahbode/svc-x'`; the
        //    documented adoption step is to DROP that hack, never for us to
        //    detect it.
        //
        // ⚠️ this clamp guards a refusal, so it goes red on an ADDITION: any
        //    later "strip a duplicate org" guard — which reads as a kindness
        //    and is a silent re-point of somebody's path — fails here.
        expect(result).toEqual('/ahbode/ahbode/svc-x/prod/database.password');
      });

      then('so the segment count exceeds four, which is the tell', () => {
        // .note = every other derive in this suite asserts exactly 4. this is
        //         the one shape that does not, and it is why the adoption note
        //         says to drop the hack — the arity is what a reader spots.
        expect(result.split('/').filter(Boolean)).toHaveLength(5);
      });
    });
  });

  given(
    '[case9] a SCOPED package name — the same trap, by another route',
    () => {
      // ⇒ catalog: `1.vision.experience.case=_.md`, cell `h3` on axis H
      //   (repo-shape = `scoped`). itemized rather than demoed — an ALTERPATH
      //   with a workable remedy (pass `repo` explicitly). the axis was added
      //   by the `r5` peer review, and `h3`'s row is what a later "strip the
      //   scope" kindness has to contradict.
      const uri = new SdkConfigUri({
        scheme: 'aws::param',
        explicitPath: null,
      });

      when('[t0] the repo slug carries an npm scope', () => {
        // derived once; both assertions below grade the same string
        const result = asSdkConfigPath({
          uri,
          org: 'ehmpathy',
          repo: '@ehmpathy/svc-x',
          choice: 'prod',
          keyPath: 'database.password',
        });

        then(
          'the scope becomes its OWN segment — the `@` is not stripped',
          () => {
            // 🔴 raised by a peer architect read, never by the vision's own walk.
            //    the vision named it as awkward #4 and declined to clamp it,
            //    because neither cited repo is scoped. ⇒ that made it a hazard
            //    with NO test at any grade, which is a worse state than a
            //    documented one — `getOneRepo` returns `package.json.name` raw
            //    (its `nameFound` read) and `asSdkConfigPath` splices it
            //    verbatim.
            //
            // .note = the reference names the EXPRESSION, never a line number.
            //         it read `getOneRepo.ts:89` until a peer caught that the
            //         read/parse split had moved line 89 into the read-failure
            //         catch — so the pointer sent a reader to the wrong half of
            //         the file. a line number in a comment carries a decay
            //         clock; a named expression is greppable and does not rot.
            //
            // ⛔ do NOT "fix" this by a scope strip inside `asSdkConfigPath`.
            //    it is the same kindness `[case8]` refuses, and for the same
            //    reason: this op cannot tell a scope a caller WANTS in the path
            //    from one they do not, and a strip silently re-points whatever
            //    param a scoped repo already stores at. the documented remedy is
            //    to pass `repo` explicitly — a caller decision, over ours.
            expect(result).toEqual(
              '/ehmpathy/@ehmpathy/svc-x/prod/database.password',
            );
          },
        );

        then(
          'so it derives five segments, exactly as the org-hack does',
          () => {
            // .note = the arity is the shared tell. `[case8]` and this case reach
            //         the same wrong shape by two different routes, so a reader
            //         who learns to spot "five segments" catches both.
            expect(result.split('/').filter(Boolean)).toHaveLength(5);
          },
        );
      });
    },
  );
});
