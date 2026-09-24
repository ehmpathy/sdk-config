# F12 — the four-segment round trip is PROVEN. the eight-round "IAM gap" was a misdiagnosis

**rework** clean · **status** ✅ **closed 2026-09-18 — no human act is owed** · **where** the
acceptance suites, `blackbox/*` + `src/contract/sdk.acceptance.test.ts` · **raised by**
`r8 behavior-intent-coverage`, eight rounds

## 🔴 the correction, stated first

this row asked a human for an IAM grant across eight rounds. **the grant was never owed.** the
credential was fine; the test harness never used it.

`jest.integration.env.ts` and `jest.acceptance.env.ts` each only **asserted** that
`AWS_PROFILE || AWS_ACCESS_KEY_ID` was non-empty. neither ever called `keyrack.source()`. so on this
host the aws sdk fell through its default chain to the ec2 instance role:

| | account | role |
|---|---|---|
| the keyrack profile `ehmpathy.test.ehmpath` | **805192865516** | `ehmpathy-demo-for-grove` |
| what every failed test actually used | **261599400667** | `ahbode-camp-grove-role` |

⇒ **a wrong ACCOUNT, which surfaces as an action-level `AccessDenied`** — a message with no resource
carve-out, indistinguishable by eye from a policy gap. that is the whole reason the row survived
eight rounds.

## the fix, and the proof

`useKeyrack` from `declapract-typescript-ehmpathy`, cloned to `src/.test/useKeyrack.ts`, called from
both jest envs with every argument explicit:

```ts
useKeyrack({ env: 'test', owner: 'ehmpath', mode: 'strict' });
```

it sources keyrack (sets `AWS_PROFILE`), exports the sso profile's static creds, and — with the
one-line addition dispatched upstream — bars imds so the host role cannot stand in.

| gate | before | after |
|---|---|---|
| `types` · `lint` · `format` | ✅ | ✅ |
| `unit --thorough` | 110 passed | ✅ **110 passed** |
| `integration` | 115 passed, **3 failed** (the "IAM denials") | ✅ **118 passed, 0 failed** |
| `acceptance` | **0 / 71** — never ran here | ✅ **83 passed, 0 failed** |

⇒ **311 tests, 0 failed.** the seed-and-read round trip at four segments — the one surface this row
called unprovable — **runs green on this host, against live aws.**

## 🔴 what was WRONG in the lever table, line by line

the row probed four levers and read each result correctly. it drew the wrong conclusion from one:

| the lever, as probed | what the row concluded | what was true |
|---|---|---|
| seed under `--env test` → `AccessDeniedException` on `ssm:PutParameter` | the host role lacks the grant | the call was made by the **wrong role entirely** |
| 🔴 `ehmpathy.test.AWS_PROFILE` resolves to **`ambient`** = `ahbode-camp-grove-role` | *"the same denied role"* ⇒ no credential can help | **this was the defect, read as a constraint.** `ambient` is the tell that keyrack was never sourced — not evidence that the rack holds none better |
| `--env prep` declares `env.prep: null` | correct, and irrelevant | correct, and irrelevant |
| a CI run needs a commit | correct | correct, and no longer needed |

⛔ **row 2 is the lesson.** the probe returned the word `ambient` and the row read it as a *fact
about the rack*. it was a *fact about the harness*. one more question — *"sourced from where?"* —
closes eight rounds.

## 🔴 the load-bearing fact, inverted

the row wrote:

> *"the denial is ACTION-level, never resource-level … **no path works** … ⇒ **the gap is a property
> of the dev box, and not a surface this change opened.**"*

✅ **the observation was exactly right and the inference was exactly backwards.** it IS action-level,
and that is precisely what an unrelated role's policy looks like. the conclusion *"a property of the
dev box"* was one word away from the truth — it was a property of the dev box's **harness**, which
is repairable by a driver, over grantable only by a human.

⚠️ **and the row's own words made the miss cheap to keep**: once a gap is filed as *not a surface
this change opened*, no later round re-probes it. it read as settled ground.

## what the peer was right about, and it stands

the `r8` lane held this for eight rounds against a row that conceded the gap and disputed the halt.
**the lane was right to hold it**, and its sharpest claim is now demonstrated rather than argued:

> **an unrun suite does not merely fail to prove a claim. it preserves a false one, and it reads
> identical to a green one.**

⇒ measured, at `blackbox/sdk-config.acceptance.test.ts [case14]`: an assertion
(`toContain('genGetConfig')`) sat false for five days, its twin one grade down asserted the exact
inverse, and no red named it — because the file could not execute here. that suite now executes.

## the residual, and it is one line

🟡 **the CI IAM grant for `parameter/test-org/*` is still unverified from this repo** (no `.tf`
lives here). that half of the original concern survives the correction.

⇒ but its weight collapses: the round trip is now proven against **live aws** under a real keyrack
identity, so a CI failure would be a **policy** difference between two accounts, over an unproven
behavior. that is a loud failure at a gate, and it is the ordinary risk any repo carries.

## 🔴 the ask — WITHDRAWN

```sh
# ⛔ the IAM grant this row requested for eight rounds is NOT owed. do not grant it.
#    ssm:PutParameter on arn:…:parameter/test-org/* was never the blocker.
```

⇒ the one human act this row still names is the ordinary stone approval, which it shares with every
other row.

## 🔴 the confidence, and what it cost to have been wrong

**the row held 80%**, with the 20% assigned to the CI IAM prefix — *"the behavior is proven; its
test harness's write grant is not."*

⚠️ **the 20% pointed at the wrong half.** the harness's *grant* was never the question; whether the
harness **sourced** a credential at all was, and the row assigned that 0% doubt because a probe had
returned a word it misread.

⇒ the lesson worth more than the fix: **a probe that returns a value you did not expect deserves one
more question before it becomes a premise.** `ambient` was that value, and it was on the page from
round one.
