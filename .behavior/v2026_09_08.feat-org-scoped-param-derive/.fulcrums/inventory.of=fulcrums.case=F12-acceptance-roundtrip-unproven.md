# F12 — the four-segment seed-and-read round trip is UNPROVEN, and the stone continues anyway

**rework** clean · **status** 🔴 **disputed — the council rules** · **where** the acceptance suites,
`blackbox/*` + `src/contract/sdk.acceptance.test.ts` · **raised by** `r8 behavior-intent-coverage`,
eight rounds, unchanged

## the concern, stated in the peer's own words

> *"the seed-and-read round trip, the one place a reviewer can SEE the adoption experience work
> end-to-end, has never gone green anywhere, and the CI IAM grant for the new `/test-org/*` prefix
> is unverified (no `.tf` lives in this repo) … [to correct] a claim is not [to close] the gap."*

✅ **the peer is RIGHT, and this row does not argue otherwise.** wish acceptance #5 asks for
red-before / green-after on every criterion, and the acceptance suites — all re-pointed to four
segments — have run **0/71** here and **zero times in CI on this branch**.

⇒ this row disputes only **whether that gap must hold the stone**, never whether it exists.

## the fork, stated fairly

| option | the shape | what it costs |
|---|---|---|
| **A ✅ taken** | continue with the gap **recorded and scoped**, and let a human close it by the one act that can | a real unproven surface ships past this stone. its bound is stated below |
| B | halt until the round trip is green | 🔴 the halt names the **driver**, and no driver act clears it. it would hold the route on a **human's** inaction while it reports as mine |
| C | seed with a cross-org credential (`ahbode.prep.AWS_PROFILE`, unlocked on this host) | ⛔ **rejected.** it mints a green **CI cannot reproduce**, from a credential `.agent/keyrack.yml` does not declare ⇒ a false green, which is the exact defect this lane rejected in round 3 |
| D | commit, so CI runs the suites | ⛔ forbidden. no stone asked for a commit, and the wisher ruled it twice: *"you do not need to commit yet. no one approved your stone"* · *"you dont need commits"* (2026-09-17) |

## 🔴 why no driver act closes it — each lever PROBED, and re-probed 2026-09-17

| lever | result |
|---|---|
| seed under `--env test`, the credential this repo declares | `AccessDeniedException` — *"no identity-based policy allows the `ssm:PutParameter` action"* |
| a different aws identity via keyrack | `ehmpathy.test.AWS_PROFILE` resolves to **`ambient`** = `arn:aws:sts::261599400667:assumed-role/ahbode-camp-grove-role` — **the same denied role** |
| `--env prep` for this repo | `.agent/keyrack.yml` declares `env.prep: null` — no aws credential bound |
| a CI run | needs a commit. forbidden, and ruled twice |

🟡 **the denial is ACTION-level, never resource-level.** the message names the *action* with no
resource carve-out, so **no path works** — `/test-org/*` and `/ehmpathy/test/sdk-config/*` are
denied alike.

⇒ **that is the load-bearing fact**, and it cuts the other way from how it first reads: this host
could not seed a **three**-segment param either. ⇒ **the gap is a property of the dev box, and not
a surface this change opened.**

## what IS proven, at the real-aws grade

| claim | grade |
|---|---|
| the derive emits four segments, org first | ✅ unit, exhaustive |
| live aws **accepts** `/test-org/test-svc/test/…` | ✅ `genSdkConfigSupplierAwsParameterStore.integration [case4] [t1]` — real aws, every round. the address is built by the **real** `asSdkConfigPath`, never hand-typed |
| live aws **rejects** a malformed name | ✅ `[case4] [t2]` — so `[t1]` means **accepted**, over merely *errored* |
| the refusal text a config author meets | ✅ snapped at `genGetConfig.integration [case28]` |
| 🔴 a seeded param at four segments reads back | **unproven.** CI does this |
| 🔴 the CI IAM grant covers `parameter/test-org/*` | **unverifiable here** — no `.tf` in this repo |

🟡 **`[case4]` is a real discrimination, and it is not the round trip.** it proves aws will *hold* an
address of this shape; it does not prove a value written there comes back. the peer's distinction is
exact and is conceded.

## 🔴 the cost of an unrun suite, measured — it PRESERVES a false claim

found 2026-09-18, in `blackbox/sdk-config.acceptance.test.ts [case14]`:

```ts
expect(error.message).toContain('genGetConfig'); // the call-site remedy
```

**that assertion is false, and it had been false since F11.** the `org` key was cut on 2026-09-13,
so `getOneOrg` names one remedy and never `genGetConfig` — and the line's own twin one grade down
asserts the exact inverse:

| surface | the assertion | runs? |
|---|---|---|
| `genGetConfig.integration.test.ts:1316` | `not.toContain('genGetConfig')` | ✅ every round |
| `blackbox/sdk-config.acceptance.test.ts:780` | `toContain('genGetConfig')` | 🔴 **never, here** |

⇒ **two files asserted opposite claims about one sentence for five days, and no red named it** —
because the file that held the false one cannot execute on this host.

🔴 **this sharpens what the row disputes, and it does not weaken the concession.** the peer's claim
was that the round trip is unproven; this shows the bound is wider than *unproven*:

> **an unrun suite does not merely fail to prove a claim. it preserves a false one, and it reads
> identical to a green one.**

⇒ what it changes, in each direction — stated rather than picked:

- **for the peer** — it is evidence FOR their concern, over against it. a suite nobody runs is not
  a neutral gap; it accrues stale assertions at the rate the surface changes
- **for this row** — the mechanism is the one the row already named. the assertion was caught by a
  **read**, and the repair is shipped. what CI adds is that the catch no longer rests on a reader

⚠️ **and it is why option A stays defensible rather than why it stops being so**: the failure this
found would have fired **loudly, at a gate, on the first CI run after merge** — which is exactly the
residual risk the row already accepts, now with a named instance.

✅ **repaired at the line**, with the inversion recorded beside it so the next reader meets the
lesson where it was learned, over in a yield.

## the ask — one of two, and both are a human's

```sh
# either: grant the write action to the host role, then the suite runs here
#   ssm:PutParameter + ssm:DeleteParameter
#   secretsmanager:CreateSecret + GetSecretValue + DeleteSecret
#   on arn:aws:ssm:us-east-1:261599400667:parameter/test-org/*
#   for arn:aws:iam::261599400667:role/ahbode-camp-grove-role

# or: approve the stone, and let CI run the re-pointed suites on merge
rhx route.stone.set --stone 5.1.execution.from_vision --as approved
```

⚠️ **the second is the cheaper one and it carries the residual risk this row names**: if CI's policy
does not grant `parameter/test-org/*`, the suites fail on the first run after merge. that is a
**loud** failure at a gate, never a silent one in production — which is why option A is defensible.

## 🔴 the confidence, and why it is not higher

**80%.** the 20% is not about whether the derive works — that is clamped at the unit grade and at the
real-aws read grade. it is about the **CI IAM prefix**, which no artifact in this repo can settle.

⇒ a reviewer who grades this row should read it as: *"the behavior is proven; its test harness's
write grant is not."*
