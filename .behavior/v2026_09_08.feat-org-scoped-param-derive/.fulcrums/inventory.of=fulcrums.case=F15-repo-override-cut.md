# F15 — the `repo` override is cut too. a `repository` config field replaces it

**rework** clean · **status** ✅ ruled by the wisher, 2026-09-20 · **where**
`genGetConfig.ts`, `getOneRepo.ts`, `asStaticConfig.ts`, `readme.md`, every test fixture

## the call

> **`genGetConfig` takes no `repo` key either.** the repo has two DECLARED sources, in one
> precedence: the config's `repository` field, else `package.json`'s `name` with its npm scope
> stripped. neither is an argument.

```
org   → config `organization`                        → required
repo  → config `repository`, else package.json `name` → the field is optional
```

## 🔴 it strikes F11's own argument, and that is the row worth the read

F11 cut the `org` override and kept `repo`'s, under a title that reads
*"the asymmetry with `repo`, which is earned"*:

> | key | sources | what an override does |
> |---|---|---|
> | `repo` | an argument, else `package.json`'s `name` | **picks** between two sources that both exist |
> | `org` | the config's `organization` | would **mint** a second |
>
> ⇒ *"so the two are not an inconsistency to harmonize."*

⚠️ **the table was true and its conclusion did not follow.** an override that picks between two
sources is still a THIRD source, and a third source multiplies the space exactly as a second
does. F11 measured that multiplication for `org` — 24 cells for 1 experience — and then declined
to apply the measurement one column to its left.

⇒ **the question F11 asked was *"does this override mint a source?"*. the question it owed was
*"who asked for this, and what breaks without it?"*** — which is the test its own seeded rule
(`rule.forbid.combinatorial-explosion`) states.

## the fork, stated fairly

| option | the shape | verdict |
|---|---|---|
| **A** — a declared field, plus a default ✅ **ruled** | config `repository`, else `package.json` `name` | the org's own shape, one column left |
| B — an override, plus a default | `genGetConfig({ repo })`, else `package.json` | the extant state. a third source |
| C — a required argument | every call site passes it | 🔴 **i took this first, and it was wrong** — see below |
| D — package.json only | no declared route at all | a repo whose param namespace differs from its package name has nowhere to say so |

### 🔴 the over-correction, on record

the wisher's words were *"no fallbacks"*. i read that as **C** and made `repo` a required
argument — 96 typecheck errors, every call site edited. two corrections followed:

> *"why is repo an input? it should come from package.json by default"*

> **"its not a fallback. its an ergo choice; if not already explicitly in the config like
> organization is"**

⇒ **the objection was never to the package.json read.** it was to the word *fallback* and to the
**argument** that made the read a fallback rather than a default. a default is what you get when
you declare none; a fallback is what you get when a prior source failed. there was no prior source
to fail — the argument was the third one, and it was the piece to cut.

## what it fixed, beyond the space

the override carried a trap the readme had **documented rather than removed**:

| `repo` resolved to | derived | segments |
|---|---|---|
| `'ehmpathy/svc-x'` — the pre-`organization` workaround | `/ehmpathy/ehmpathy/svc-x/prod/…` | 5 |
| `@ehmpathy/svc-x` — a scoped `package.json` name | `/ehmpathy/@ehmpathy/svc-x/prod/…` | 5 |

⇒ five segments, **no error**, and a path no param lives at. the readme's remedy was
*"pass `repo` explicitly if your package is scoped"* — a workaround for a trap, offered through
the very key that made the trap reachable.

🔴 **the scope case is now FIXED, over documented** (`rule.require.solve-at-cause`): `asRepoSegment`
strips an `@scope/` prefix. a scope names an ORG, and the org is its own segment, so the scope is
redundant here **by construction**. clamped at `getOneRepo [case2]` and at
`genGetConfig [case32] [t2]` through a `config-scopedrepo` fixture.

🟡 the first row survives, narrowed: a config that declares `repository: 'ehmpathy/svc-x'` still
splices two segments. that is the author's own hand-typed value in their own file, and no longer a
value an argument could smuggle in.

## what else it bought

- **a pure factory.** `genGetConfig` once read `package.json` **synchronously at construction
  time** — module load, in practice. a bundled lambda with no `package.json` beside it threw
  before any handler ran. the repo is now read per fill, inside `asStaticConfig`, so a config that
  declares `repository` looks for no file at all
- **one route to both segments.** `asStaticConfig` returns `{ config, org, repo }`. a surface added
  later inherits both by construction
- **one word, one concept.** `repo` and `org` are now supplied identically, so a reader meets no
  asymmetry to explain — which is what the vision's awkward #6 said *"will read as an
  inconsistency until someone traces it"*

## what the verdict struck

- `genGetConfig`'s `repo?: RepoSlug` key, its jsdoc, and the factory-time `getOneRepo` call
- `getOneRepo`'s `override` parameter and its precedence branch
- `getOneRepo.integration.test.ts` — every `override:` call site, re-subjected to
  `static: { repository }`; `[case11]`'s blank-**override** clamp is now a blank-**field** clamp
- `genGetConfig.integration.test.ts [case8]` (repo-from-package.json through the argument) and
  `[case33]` (the factory-surface refusal, which has no factory surface left)
- 18 `repo:` arguments across the two blackbox suites
- the readme's *"⛔ two ways `repo` splices an extra segment"* section — the trap is gone, so its
  documentation is too

## what it added

- `getOneRepo({ static, cwd })` — the config route first, the package.json default second
- the npm-scope strip in `asRepoSegment`, with its own `⛔` note
- three fixtures whose whole job is a repo route: `config-norepo` (the default),
  `config-scopedrepo` (the strip), `config-badrepo-blank` (the empty guard)
- `config-journey` — the journey suite's own namespace. both blackbox suites write REAL aws params
  and delete them in `afterAll`, and jest runs test files in parallel workers, so a shared derived
  path means one suite reaps the other's mid-run. the `repo: 'my-app'` argument used to give that
  isolation; a distinct `repository` gives it now
- a `path` locator on every `asRepoSegment` throw, so a `"name": 42` names the same file its
  absent-key peer one line up already named

## the gates

types · lint · format · **unit 65** · **integration 103** · **acceptance 81** — all green, the
acceptance suite against real aws, and every snapshot re-run **without** `--resnap` to prove it
enforces.
