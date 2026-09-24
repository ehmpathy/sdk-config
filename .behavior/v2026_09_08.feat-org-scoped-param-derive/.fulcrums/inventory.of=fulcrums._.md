# fulcrums — v2026_09_08.feat-org-scoped-param-derive

forks best-guessed mid-drive, appended at the moment each was taken. the council rules at the
close; each row has an entry file with the fork stated fairly.

🔴 **amended 2026-09-20 — the wisher reopened the design after the close.** `rhx route.drive` still
reports the route complete, and **F15** landed after it: the `repo` override is cut, and a
`repository` config field replaces it. ⇒ the route's close is not a freeze, and a post-close
verdict earns a row exactly as an in-drive one does.

🎉 **the close is HERE: `rhx route.drive` reports the route complete (2026-09-18).** so this is the
council's moment, and **two** acts remain — both a human's:

| # | the act | why only a human |
|---|---|---|
| 1 | rule **F13** — accept the deferred readme clamp, or call it owed now | a scope call |
| 2 | grant a **commit quota** — `git.commit.uses get` reports none set | the quota is a human's lever |

⇒ **the route asked for no commit until now, and now it is finished**, which is warrant #2 of
`rule.forbid.commits-the-route-did-not-ask-for`. the work sits uncommitted in the worktree until
act 2.

🔴 **a third act stood here until 2026-09-18 — F12's IAM grant — and it is WITHDRAWN.** the grant was
never owed. both jest envs only **asserted** a credential was present and never called
`keyrack.source()`, so the aws sdk fell through to this host's ec2 instance role: account
`261599400667` (`ahbode-camp-grove-role`), where the keyrack profile resolves to `805192865516`
(`ehmpathy-demo-for-grove`). a **wrong account**, which surfaces as an action-level `AccessDenied`
indistinguishable by eye from a policy gap.

⇒ repaired with `useKeyrack` in both envs. **311 tests, 0 failed** — incl. the acceptance suites
that had run **0/71**, and the seed-and-read round trip F12 called unprovable. F12's entry now reads
as a misdiagnosis rather than a dispute.

✅ **thirteen are ruled.** 🔴 **one is open — F13**, a deferral the driver **chose**, which the
council may overrule.

🔴 **F14 is WITHDRAWN, and its retraction is the row worth a read.** it argued that three rules
barred every route to an orchestration-grade repo refusal. **two of the three bars did not exist**:
`repo: ''` reaches the throw through the public key with no seam at all, and `process.chdir` is
barred by no rule in this repo — i had cited `rule.require.hermetic-tests`, which cuts the other
way. the peer re-raised it as a blocker, correctly, and the repair landed at `[case32]`/`[case33]`.

⇒ **a hard route and a barred route are two different claims.** only the second earns a dispute, and
i reasoned from the first to the second with no read of the seam.

| case | title | rework | status | confidence at the time |
|---|---|---|---|---|
| F1 | org source = static config `organization`; package.json owner rejected | clean | ✅ **ruled** | 85% |
| F2 | a malformed `organization` throws, rather than a quiet no-org fallback | clean | ✅ **ruled** | 75% |
| F3 | the org segment applies to every auto-derived scheme, not `aws::param` alone | clean | ✅ **ruled** | 80% |
| F4 | the term is **`org`**, sourced by a `getOneOrg` transformer | clean | ✅ **ruled** | — |
| F5 | ~~`org: null` is a force-off escape hatch~~ → **no force-off** | clean | ✅ **ruled** | 70% |
| F6 | the derived shape follows the wish literally — `{choice}` kept, keyPath dot-joined | clean | ✅ **ruled** | 78% |
| F7 | the org's **charset** is unchecked — a literal string is spliced as declared | clean | ✅ **ruled** | 80% |
| F8 | `organization` is **required**; its absence fails fast — 🔴 strikes acceptance #2 | clean | ✅ **ruled** | — |
| F9 | `OrgSlug` + `RepoSlug` typed in contracts; `repoName` → `repo` as a **hard cut** | clean | ✅ **ruled** | 97% |
| F10 | one barrel, at `contract/sdk.ts` — `package.json` points at it, no root forwarder | clean | ✅ **ruled** | 🔴 88% → 62% → **ruled by the wisher** |
| F11 | 🔴 the `org?` override is **cut** — the config is the ONE source | clean | ✅ **ruled by the wisher** | — |
| F12 | 🔴 ~~the four-segment **seed-and-read round trip is unproven**~~ → **proven; the "IAM gap" was a misdiagnosis** | clean | ✅ **closed — no human act owed** | 80% → **retracted** |
| F13 | 🔴 two readme config examples that threw are **fixed**; the **clamp** that keeps them fixed is deferred | clean | 🔴 **best-guessed — open to the council** | 82% |
| F14 | 🔴 ~~the seven **repo-resolution** refusals stay snapped at the **op** grade~~ | n/a | 🔴 **WITHDRAWN — the dispute rested on a false premise; repaired at `[case32]`/`[case33]`** | 88% → **retracted** |
| F15 | 🔴 the `repo?` override is **cut too** — a `repository` config field replaces it. ⇒ strikes F11's *"the asymmetry with `repo`, which is earned"* | clean | ✅ **ruled by the wisher** | — |

**rework** = clean for every row: each is a rename, a default swap, a file move, or a one-branch
change inside `asSdkConfigPath` / `getOneOrg`, with no caller hardened against it and no later
stone built on it. none is dirty, so none warranted a halt
(`rule.always.defer-fulcrums-to-last`).

🔴 **F10 and F11 are the two rows the wisher ruled from OUTSIDE the drive**, and both corrected a
call the drive had already taken. read their entries first.

🟡 **three rows are records over guesses** — F8, F9, and F11 each entered as a verdict rather than
as a fork i flagged mid-drive. they are listed because a verdict that strikes an acceptance
criterion (F8), a published key (F9), or a public key (F11) is a scope fact the criteria stone
must inherit rather than re-derive.

🔴 **F10 and F13 are DEFERRALS, not design forks.** `rule.always.fix-forward-under-scouts-honor`
says a fix deferred for DIRT owes a fulcrum beside its dream: *"a dirt call is a judgment about
ripple cost, and a judgment made alone is what a fulcrum list exists to surface."* ⇒ the dream
records the work; the row records that a call was made.

🟡 **F8 is a record rather than a guess** — it entered the list as a verdict, in answer to F1's
stated 15% doubt. it is listed because it strikes an acceptance criterion, and the criteria stone
must inherit that fact rather than re-derive it.

## ruled by the wisher — 2026-09-08

| case | the verdict | what moved |
|---|---|---|
| **F6** | ✅ the derived shape **stands**: `/{org}/{repoName}/{choice}/{keyPath}`, `{choice}` kept, keyPath dot-joined. *"we want this shape basically … and we'll get everyone else to adhere."* | the mismatch with the params in the wild is **the point**: this ships the **target convention**, and the migration is the wisher's to drive. Q3 closed. the 78% doubt is discharged, never deferred |
| **F4** | ✅ **`org`**, not `orgName` (option **D**, which my first table did not hold). the source op is `getOrg` | 46 sites renamed across the vision artifacts + 7 for `getOrg`. ⚠️ one real cost found on application: `org` sits inside `organization`, so the error that names a source must use a **form that tells them apart** (*the `org` argument* vs *the `organization` field*), never the bare word — see F4 and `case=4` |
| **F5** | ✅ **no force-off.** the caller cannot pass `null`. *"if they want a bare placeholder, they can set `org: '_'` or some other placeholder"* | my 70% doubt was correct, and the substitute beats the plain drop i offered. `org: '_'` derives `/_/svc-x/…` — a **third namespace**, over a fall back to the shared one — so every org-aware repo derives 4 segments, always. Q4 closed |
| **F1** | ✅ **option A confirmed** — the config's `organization` field. *"beautiful."* | the pick stands and its **15% doubt is dissolved**, over accepted: F8's requirement makes absence an error, so presence is no longer a weak signal for intent. every declaration is deliberate ⇒ ~100%. Q1 closed |
| **F8** | 🔴 **`organization` is required; its absence fails fast.** *"we can just enforce this as a required base schema"* | a NEW row. it **strikes the wish's acceptance #2**, and ✅ **`0.wish.md` is amended on record** — original text struck rather than deleted, in four places. coherent with the wish's *spirit*: #2 feared a **silent** org segment, and this one is loud. costs: axis B loses a value, `case=2` inverts, `case=4` `[t2]` inverts, `case=7`'s asymmetric-adoption story evaporates, and the test diff exceeds the source diff |
| **Q8** | ✅ **always, never lazy.** *"always, exactly cause lazy is a landmine"* | F8's sub-question, which its words left open. i took ALWAYS as a stated read; the wisher confirmed it with the sharper reason. ⇒ **LAZY arms a trap and hides the tripwire**: an all-explicit repo boots for months with a bad or absent field, is never validated, and fires the day someone adds a bare placeholder — separated from its cause by both time and author |
| **Q9** | ✅ **it ships as a MINOR, not a major.** *"no one uses this repo yet, so we'll keep it a minor version"* | i flagged F8 as a semver major and could not measure the external consumer population. the wisher closed that half: the break is real and **nobody can experience it**. 🟡 the ground expires — once an external consumer adopts, a change of this shape owes a major |
| **F2 · F3 · F7** | ✅ **all three confirmed as taken.** *"yes to each"* | ruled together at the close. F2: a malformed org throws (its 25% doubt shrank, since F8 already demands the key's *presence*, so a shape check is the smaller second imposition). F3: the org applies to every scheme (**the no-code answer** — `asSdkConfigPath` never reads `uri.scheme`, so a carve-out would be the added branch). F7: no charset gate (**the one row no other verdict moved** — its argument is symmetry with `repoName`, which stays ungated) |

## ruled by the wisher — 2026-09-10, at execution

| case | the verdict | what moved |
|---|---|---|
| **F9** | ✅ **`OrgSlug` + `RepoSlug` in contracts, and `repoName` → `repo` as a HARD CUT.** *"hardcuts are fine. no one uses these yet"* + *"we'll keep it minor"* | raised by the wisher themselves, after 8 self-reviews. i offered a `@deprecated repoName` alias as a substitute to keep it compatible — **struck**, and rightly: the consumer set is empty, so the alias was a pure reversibility hedge. ⚠️ and my *"this is a MAJOR"* grade was wrong on its own terms — the package is `0.2.3`, and semver permits an incompatible `0.x` minor. i verified the key was *published* and never that it was *breakable*. ⇒ 🟡 it also retires F7's 20% doubt in the direction F7 predicted: the *"better world"* where org and repo are gated in one op now at least has **one word for the pair** |

## ruled by the wisher — 2026-09-13, at execution

| case | the verdict | what moved |
|---|---|---|
| **F11** | 🔴 **the `org?` override is CUT.** *"why wouldn't we just eliminate this nasty codebranch / and force users to say organization instead / why would it be absent / if we require it"* | a public optional key deleted, and with it the whole chain it carried: the precedence rule, the absent-org state, the two error forms F4 logged as its one cost, the vision's awkward #9 (*an optional ARGUMENT for a REQUIRED VALUE*), and 87 lines of test whose only subject was to tell the two sources apart. ⇒ **nobody asked for the key** — the wish demanded a *declared source* (acceptance #4) and said naught of an override. the wisher generalized it into a rule and dispatched two: `ehmpathy/rhachet-roles-ehmpathy#674` (`rule.forbid.combinatorial-explosion` — the STATE) and `#675` (`rule.forbid.freedom-degrees-accretion` — the ACT over time) |
| **F10** | ✅ **`contract/sdk.ts` is the one barrel.** *"why did we remove contract? contract/sdk.ts is preferred"* | **option D**, over the option B the drive had taken. `package.json` `main` + `types` point at `dist/contract/sdk.js`; there is no `src/index.ts` to forward from, so the two-list drift the rule predicts has no place to live. ⇒ i had read a peer's *"contract isn't worth its place"* as a settlement of a bounded-context question that was the wisher's |

## 🔴 open to the council — F12, disputed 2026-09-17

🔴 **amended 2026-09-18: this row once read *"the only row a human must rule before this stone
passes."* that is no longer true, and the correction matters.** the stone **passed** at `i009` — all
12 lanes terminal, 0 blockers, judge allowed — and `rhx route.drive` reports the **route complete**.

⇒ so F12 did **not** hold the stone, and the dispute was resolved in the direction this row argued:
the gap is real, and it was not a reason to halt. what stays open is the **grant itself**, which is a
human's and always was. every other fulcrum is ruled.

| | |
|---|---|
| the concern | `r8 behavior-intent-coverage` — the four-segment **seed-and-read** round trip has never gone green, so wish acceptance #5 is unmet at the real-aws grade |
| ✅ the peer is **right** | conceded outright. the row disputes whether the gap must **hold the stone**, never whether it exists |
| why it is disputed over conceded | *conceded* promises a fix, and **no driver act is a fix**. the grant is action-level denied on the one credential this repo declares, and the CI route needs a commit the wisher forbade twice |
| the load-bearer | the denial is **action-level**, so this host could not seed a *three*-segment param either ⇒ **a property of the dev box, not a surface this change opened** |
| the ask | an IAM grant on `ahbode-camp-grove-role`, **or** `--as approved` and let CI run the re-pointed suites on merge. both are a human's |

⚠️ **the residual risk, stated plainly**: if CI's policy does not grant `parameter/test-org/*`, the
suites fail on their first run after merge — **loudly, at a gate**, never silently in production.
that is what makes it defensible to continue, and it is the 20% F12 declines to claim.

## 🟡 open to the council — F13, best-guessed 2026-09-18

**a deferral the driver chose, over a concern the driver cannot close.** it halts naught; the
council may simply overrule the call.

| | |
|---|---|
| what was found | two readme yaml config examples declared no `organization` — the **quickstart** (`:21`) and the **explicit path example** (`:160`). each throws when copied as written, because F8 made the field required |
| ✅ both are **fixed** | in the same gate, under scouts honor. the diff is four lines of yaml plus two callouts |
| what is deferred | the **clamp** — a test that reddens when a readme config example omits the field |
| why deferred | the clamp fails CLEAN: it needs a fence parser, a **fragment-exemption convention that does not exist**, and a scope call. three decisions this wish never scoped |
| 🔴 the honest counter | **the class already recurred once on this route** — two blocks, both caught by a human read rather than a gate. if the council reads recurrence as the stronger signal, the clamp is owed now |
| the rework | **clean, and purely additive** — the fixes stand alone; the clamp is a new file. reversal is an addition, never a teardown |

## 🟡 what remains, and it is not a fulcrum

- **Q5** *(research)* — aws ssm name-length and hierarchy-depth limits for a 4-segment path. gates
  no design choice; a verification owed at execution.
- **Q6** *(research)* — is a second org's repos in account `398838478359` today? changes the
  **urgency**, never the design. put to the wisher and left unanswered, which is the correct place
  for it.
- **F7's 20% doubt** — the better world gates **both** the org and `repoName` in one op. out of
  scope here, and a clean follow-up.
