import { BadRequestError, getError } from 'helpful-errors';
import { given, then, when } from 'test-fns';

import { getOneOrg } from './getOneOrg';

describe('getOneOrg', () => {
  given('[case1] the config declares an organization', () => {
    when('[t0] it is a plain literal', () => {
      then('it reads the declared field', () => {
        expect(
          getOneOrg({ static: { organization: 'ahbode', database: {} } }),
        ).toEqual('ahbode');
      });
    });

    when(`[t1] it is the '_' placeholder`, () => {
      then('it is honored as a literal org, never as a force-off', () => {
        // .note = this is the F5 clamp. '_' must derive its OWN namespace, so a
        //         later author cannot quietly restore a no-org fallback here.
        //         the docs teach exactly this form — the required-field hint,
        //         the empty-org hint, and the readme all say
        //         `"organization": "_"` — so it is the form every author types.
        //
        // ⚠️ the plausible break is narrow and it lands HERE: a later author
        //    who wants a no-org escape hatch back would special-case `'_'`.
        expect(getOneOrg({ static: { organization: '_' } })).toEqual('_');
      });
    });
  });

  given('[case2] the config declares NO organization', () => {
    const staticConfig = { database: { password: 'x' } };

    // .note = each `then` re-throws rather than shares one error, on purpose.
    //         `rule.forbid.redundant-expensive-operations` scopes itself to
    //         operations ">10ms or with cost", and this is a key read plus a
    //         trim. its `useThen` remedy is absent from the pinned
    //         test-fns@1.7.2 (which exports only usePrep/useBeforeAll/
    //         useBeforeEach), and a `useBeforeAll` hoist would move a failure
    //         out of the assertion and into a hook shared by all three — so
    //         a regression would report three times, at none of the lines
    //         that describe it.
    when('[t0] the field is absent', () => {
      then('it throws — the field is required', async () => {
        const error = await getError(async () =>
          getOneOrg({ static: staticConfig }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('organization');
        // .note = the snapshot puts the WORDING in the pr diff, so a reviewer
        //         can read the sentence a config author will actually meet.
        //         this is the most-read new error this change ships — every
        //         repo that adopts the required field hits it once.
        //         (`rule.require.snapshots`: use a snapshot AND assertions)
        expect(error.message).toMatchSnapshot();
      });

      then('the error teaches the ONE remedy', async () => {
        const error = await getError(async () =>
          getOneOrg({ static: staticConfig }),
        );
        // 🔴 one source, so one remedy — and the error must not offer a second.
        //    a message that named a call-site fix would advertise a surface
        //    that does not exist, and send a reader to look for it.
        expect(error.message).toContain('your-org'); // the config remedy
        expect(error.message).not.toContain('genGetConfig');
      });

      then('the error names the placeholder escape hatch', async () => {
        const error = await getError(async () =>
          getOneOrg({ static: staticConfig }),
        );
        expect(error.message).toContain('placeholder');
      });
    });
  });

  given('[case3] the declared organization is not a literal string', () => {
    when('[t0] it is an object', () => {
      then('it throws', async () => {
        const error = await getError(async () =>
          getOneOrg({ static: { organization: { name: 'ahbode' } } }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('literal string');
        // .note = each of the four throws this op can raise is snapshotted
        //         ONCE, at its first occurrence — so a reviewer reads all four
        //         sentences in the diff, and a case that merely re-reaches a
        //         snapshotted throw asserts without one
        //         (`rule.require.snapshots`: use a snapshot AND assertions)
        expect(error.message).toMatchSnapshot();
      });

      then('the error names the one place an org is declared', async () => {
        // .note = with one source, attribution is trivial — and it is still
        //         clamped, because the message is what a reader acts on. it
        //         must name the `organization` field outright rather than a
        //         bare `org`, which occurs inside it and points nowhere.
        const error = await getError(async () =>
          getOneOrg({ static: { organization: { name: 'ahbode' } } }),
        );
        expect(error.message).toContain('`organization` field');
        expect(error.message).toContain('declared in the config');
      });
    });

    when('[t1] it is a number', () => {
      then('it throws', async () => {
        const error = await getError(async () =>
          getOneOrg({ static: { organization: 42 } }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('literal string');
      });
    });

    when('[t2] it is a placeholder uri', () => {
      then('it throws, over an attempt to fill it', async () => {
        // .note = the org is read before any supplier runs, so a placeholder
        //         here can never be filled. say so, rather than fail later.
        const error = await getError(async () =>
          getOneOrg({ static: { organization: '$.at(aws::param/org)' } }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('placeholder');
        expect(error.message).toMatchSnapshot();
      });

      then('the error says WHY it can never be filled', async () => {
        const error = await getError(async () =>
          getOneOrg({ static: { organization: '$.at(aws::param/org)' } }),
        );
        // .note = a reader whose org is a placeholder assumes it will be filled
        //         like every other value in the file. the error must break that
        //         assumption, over merely refuse.
        expect(error.message).toContain('before any supplier runs');
      });
    });

    when('[t3] it is an empty string', () => {
      then('it throws — a blank would splice a blank segment', async () => {
        const error = await getError(async () =>
          getOneOrg({ static: { organization: '' } }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('empty');
        // .note = the fourth and last distinct throw. its hint names the `"_"`
        //         placeholder escape hatch, so the snapshot is where a reviewer
        //         confirms the F5 opt-out is taught at the moment it is needed.
        expect(error.message).toMatchSnapshot();
      });
    });

    when('[t4] it is whitespace only', () => {
      then('it throws, same as blank', async () => {
        const error = await getError(async () =>
          getOneOrg({ static: { organization: '   ' } }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('empty');
      });
    });

    when('[t5] it is null — a yaml key written with no value', () => {
      then('it throws, and never reads as an absent field', async () => {
        // 🔴 the likeliest malformation a human writes, and the one shape the
        //    `undefined` guard does NOT catch: `organization:` with an empty
        //    value parses to null, and `null !== undefined`, so it falls past
        //    the required-field check into the literal check.
        //
        // ⚠️ both paths must throw, and they throw DIFFERENT messages — the
        //    field is present-but-unusable, never absent. a build that coerced
        //    null to "absent" would send the reader to add a field they had
        //    already written.
        const error = await getError(async () =>
          getOneOrg({ static: { organization: null } }),
        );
        expect(error).toBeInstanceOf(BadRequestError);
        expect(error.message).toContain('literal string');
        expect(error.message).not.toContain('lacks a required');
      });
    });
  });

  given('[case4] the declared organization carries wrapper slashes', () => {
    when('[t0] it is wrapped on both sides', () => {
      then('they are trimmed — a double slash is an invalid ssm name', () => {
        expect(getOneOrg({ static: { organization: '/ahbode/' } })).toEqual(
          'ahbode',
        );
      });
    });

    when('[t1] it holds an INNER slash', () => {
      then('the inner slash survives — the author meant two segments', () => {
        expect(getOneOrg({ static: { organization: 'ahbode/team' } })).toEqual(
          'ahbode/team',
        );
      });
    });
  });

  given('[case5] the declared organization holds wrapper whitespace', () => {
    when('[t0] it is padded on both sides', () => {
      then('the pad is stripped, exactly as a wrapper slash is', () => {
        // 🔴 raised by a peer as an UNDOCUMENTED strip, and it is documented
        //    now — but the peer's first remedy (drop the `.trim()`) would
        //    REGRESS [case3] [t4]. `'   '` passes the `typeof` check, so the
        //    trim-then-empty-guard pair is the sole reason it becomes a named
        //    throw; with no trim it splices `/   /` and derives a name aws
        //    refuses, three files from the line that caused it.
        //
        // ⇒ so the strip carries weight, and this case says so in a form a
        //   later author cannot delete by accident.
        expect(getOneOrg({ static: { organization: '  ahbode  ' } })).toEqual(
          'ahbode',
        );
      });

      then('an INNER space survives — only the wrapper goes', () => {
        // ⚠️ the strip must not grow into a charset gate (F7's ruled `no`). an
        //    inner space is a value the author typed on purpose, and aws
        //    refuses it loudly one layer down — which [case6] already pins.
        expect(getOneOrg({ static: { organization: ' Acme Inc ' } })).toEqual(
          'Acme Inc',
        );
      });
    });
  });

  given('[case6] the declared organization holds a hostile charset', () => {
    when('[t0] it is a display name with a space', () => {
      then('it passes through ungated — aws refuses it downstream', () => {
        // .note = this is the F7 clamp. `repo` is spliced raw too, so a
        //         gate here would leave one segment checked and its neighbour
        //         open. the failure stays loud, one layer down.
        expect(getOneOrg({ static: { organization: 'Acme Inc' } })).toEqual(
          'Acme Inc',
        );
      });
    });
  });
});
