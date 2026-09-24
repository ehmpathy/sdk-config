# F14 — 🔴 WITHDRAWN. the repo-resolution refusals ARE snapped at the caller's grade

| | |
|---|---|
| raised | `r2 nitpick.1` (i003), re-raised `r2 blocker.1` (i004), `5.3.verification` |
| taken | 🔴 **withdrawn** — i disputed it, the dispute rested on a false premise, and the repair landed |
| rework | n/a — the fulcrum is closed, over deferred to the council |
| confidence | **99%** — the repair is measured: 18 new tests, 9 sentences snapped |

## 🔴 the withdrawal, first

this fulcrum argued that no permitted act could snap the seven `getOneRepo` refusal sentences at the
`genGetConfig` surface. **the argument was wrong, and it was wrong in a way i could have caught with
one file read.** the peer re-raised it as a blocker, and the re-raise was correct.

⇒ the concern is now **conceded**, and the council owes this no verdict.

## what the dispute claimed, and what a read of the seam showed

| the claim i made | what is true |
|---|---|
| *"there is no third input"* | ⛔ false, twice over — see both rows below |
| route 1: a `cwd` key on `genGetConfig` is barred (`#675`) | ✅ **stands** — and it was never needed |
| route 2: `process.chdir` is barred by `rule.require.hermetic-tests` | 🔴 **false.** NO rule in this repo mentions `chdir`. i inferred the bar and cited a rule that in fact cuts the other way |
| route 3: a `process.cwd` spy is a mock | ✅ stands — and also unneeded |

### the two routes i missed

- 🔴 **`repo: ''` needs no seam at all.** `genGetConfig` converts with `input.repo ?? null`, and
  `''` is **not nullish** — so a blank override rides the public key straight into `asRepoSegment`
  and throws `repo is empty`. one of the seven sentences was reachable from the public surface the
  entire time i argued that none were.
- 🔴 **`process.chdir` is permitted, and it is MORE hermetic here, not less.** jest gives each test
  **file** its own worker process and runs the tests within a file **serially**, so the mutation
  races no peer suite. and the target is a fixture dir **inside the repo**, so the case depends on
  less host state than one that reads the real repo root. my citation of
  `rule.require.hermetic-tests` inverted the rule it named.

## what landed

| block | grade | covers |
|---|---|---|
| `genGetConfig.integration [case32]` | orchestration | `repo: ''` and `repo: '/'` — the public-key refusals, no seam needed |
| `genGetConfig.integration [case33]` | orchestration | the seven package.json sentences, driven by a `try/finally` `chdir` |

⇒ **9 snapshot entries, 18 assertions, all green**, each normalized with the repo's one `<cwd>`
marker so no host path enters a `.snap`.

🟡 **one fixture had to change, and the change is the truer test.** `getOneRepo`'s own suite points
`cwd` at an **absent** dir, which it may do because it takes the cwd as an argument. `chdir` cannot
— it throws its own `ENOENT` first. so the absent-file sentence is driven by an **extant dir that
holds no package.json**, which is what the message actually claims: the FILE was not found, never
the directory.

## 🔴 the method lesson, and it is the part worth the ink

i argued from what i **recalled** of the seam rather than from a **read** of it. the `.note` i wrote
at `[case8]` stated *"there is no third input"* as a fact; two inputs existed, and one of them was
four characters long.

⇒ **a dispute is a claim about the world, and it owes the same probe a repair does.** the cost was
exact: one round of a reviewer's budget, and a real coverage gap held open while i defended it.

⚠️ **and the shape is recognizable.** the same failure had already been named on this route — a
comment that claimed a coupled `then` block made an assertion *"strictly stronger"* when both blocks
called one function on one fixture (`r7`, i003). both were arguments that sounded structural and
that no one, myself included, had checked against the code.

## what the peer got right that i had conceded and then reasoned past

the report's own sentence: *"the mechanism obstacle is real, but it does not satisfy the rule …
`rule.require.contract-snapshot-exhaustiveness` is a zero-gap rule."*

⇒ i had conceded the **generalization** in this very file — *"i cannot refute the generalization,
only its remedy"* — and then let the remedy's difficulty stand in for its impossibility. **a hard
route and a barred route are two different claims**, and only the second justifies a dispute.
