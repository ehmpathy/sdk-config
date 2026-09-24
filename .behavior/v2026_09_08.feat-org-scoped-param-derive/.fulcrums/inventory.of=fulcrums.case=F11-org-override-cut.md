# F11 — the `org?` override is cut. the config is the ONE source

**rework** clean · **status** ✅ ruled by the wisher, 2026-09-13 · **where**
`genGetConfig.ts`, `getOneOrg.ts`, `asStaticConfig.ts`, `readme.md`

## the call

> **`genGetConfig` takes no `org` key.** the org has one source — the static config's required
> `organization` field — and no surface may offer a second. to pin a different org, edit the
> config; to opt out of a shared namespace, declare `"organization": "_"`.

## the fork, stated fairly

| option | the shape | why it loses |
|---|---|---|
| **A** — one source ✅ **ruled** | the config declares it. `getOneOrg({ static })` | — |
| B — a source plus an override | `getOneOrg({ override, static })`, `override ?? field` | it multiplies the experience space. see the cost chain |
| C — an override alone | every call site passes the org | 🔴 **the wish forbids it outright.** acceptance #4: *"a caller who must pass the org by hand at every call site has not been unblocked"* |

## 🔴 the cost chain — what ONE optional key bought

| # | the cost | its dependency |
|---|---|---|
| 1 | a precedence rule, `override ?? field` | the key itself |
| 2 | an absent-org state, which F8 then had to make illegal | 1 |
| 3 | TWO error forms per throw — `org` sits inside `organization`, so a message that names its source cannot use the bare word, and a test cannot assert it with a bare `toContain` | 1 |
| 4 | an optional ARGUMENT for a REQUIRED VALUE — the vision's own awkward #9, *"a contradiction the signature cannot express"* | 1 |
| 5 | 87 lines of test (`getOneOrg [case4]`) whose only subject is to tell the two sources apart | 3 |

⇒ **2–5 do not exist if 1 does not.** a degree of freedom multiplies the experience space; it does
not add to it.

### 🔴 and "multiplies" is a measurement, not a metaphor

the vision's experience catalog prices it exactly. the `org` argument was a **value on axis B**, so
its removal did not subtract one experience — it removed B's whole quarter, paired with every value
of `A`, `C`, `D`, and `E`:

| | before | after | cut |
|---|---|---|---|
| axis B values | 4 | **3** | the `override` value |
| the product | `3 × 4 × 2 × 2 × 2` = **96** cells | `3 × 3 × 2 × 2 × 2` = **72** | **24 cells** |
| distinct experiences, per actor | 5 · 9 · 5 | **4 · 6 · 4** | 1 · 3 · 1 |
| inventory rows struck | — | — | r9 · r9b · r10 · r11 · r12 · a5 · a6 · o4, plus one E-overlay region |

🔴 **of the 8 struck rows, ONE held a distinct experience** (`r9` → `case=6`). the other seven were
verdicted *"same shape as r6"*, *"org inert; same as r7"*, *"org inert; same as r8"*, *"same error
shape as o1"*, *"same shape as the row above"*.

⇒ **seven verdicts whose entire content was that they were redundant** — and every one of them had
to be walked, itemized, and defended before it could say so. that is the cost, measured:
**24 cells of obligation for 1 experience.**

🟡 **and the one experience it bought survives without it** — `case=6` is re-subjected to a config
edit, and the opt-out it demos is unchanged (`"organization": "_"`, F5).

🔴 **and F4 already logged cost 3 as its one price, under the belief it was unavoidable.** it was
avoidable, and the way to avoid it was to delete the second source — which is the shape the
override made invisible: each cost was reasoned about on its own, and none was reasoned about as a
consequence of the key.

## why the key was never demanded

the wish's acceptance #4 asks for **a declared source**:

> *"the org has a declared **source**, not an override argument alone — a caller who must pass the
> org by hand at every call site has not been unblocked."*

⇒ it rules out option C and says naught about an override beside a source. the drive added one
anyway, and the vision's own contract block described it as *"the escape hatch rather than the
mechanism"* — an escape from a state (no org) that F8 made unreachable **on the same day**.

⇒ **the demand died at F8 and the key outlived it by the entire execution stage.** five peer
reviewers read the diff across two rounds and none raised it.

## the asymmetry with `repo`, which is earned

`repo` keeps its override, and the seam is a **fallback**:

| key | sources | what an override does |
|---|---|---|
| `repo` | an argument, else `package.json`'s `name` | **picks** between two sources that both exist |
| `org` | the config's `organization` | would **mint** a second |

⇒ so the two are not an inconsistency to harmonize. a `repo` override chooses among extant
sources; an `org` override would create the multiplication this row cuts.

## what the verdict struck

- `genGetConfig`'s `org?: OrgSlug` key, and its jsdoc
- `getOneOrg`'s `override` parameter, its precedence branch, and the
  `source: 'argument' | 'field'` machinery that picked each error's sentence
- `getOneOrg.test.ts [case4]` (87 lines), plus `[case1] [t1]`, `[case1] [t2]`, `[case2] [t1]`
- `genGetConfig.integration.test.ts [case28] [t1]` (the override rescue) and the `org: null`
  type clamp — F5's claim now lives at the config grain, where the docs already point it
- the readme's *"to pin the org at the call site"* block and its `genGetConfig({ …, org: '_' })`
  example

## what it added

- `asStaticConfig` returns `{ config, org }` — the org rides with the parse, so there is **one
  route** to a parsed config and no unvetted shape for a later surface to reach
- a `@ts-expect-error` clamp at `[case28] [t3]`: the key's absence is a TYPE claim, and a type is
  the only instrument that can hold it

## the seed

the wisher generalized the lesson and named the rule themselves. two were dispatched, and they
part on subject:

| issue | rule | its subject |
|---|---|---|
| `ehmpathy/rhachet-roles-ehmpathy#674` | `rule.forbid.combinatorial-explosion` | the **state** — the space is too large. *"who asked for this, and what breaks without it?"* |
| `ehmpathy/rhachet-roles-ehmpathy#675` | `rule.forbid.freedom-degrees-accretion` | the **act over time** — a freedom outlives its demand unless actively cut |

> *"we should add constraints and constantly eliminate degrees of freedom"*
>
> *"we should forbid unnessesary degrees of freedom"*
>
> *"unless its hyper critical"*
