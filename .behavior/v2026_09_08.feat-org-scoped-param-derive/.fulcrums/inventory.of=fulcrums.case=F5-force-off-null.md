# F5 — is there a force-off?

> 🔴 **read F11 first.** the verdict stands — no force-off — and its SHAPE moved. the opt-out is
> declared in the config, `"organization": "_"`, never passed at a call site: `genGetConfig` has
> no `org` key to pass. ⇒ every reference below to `org: '_'` or to an override arm reads as
> `organization: '_'` and as the config's one source.
>
> ⇒ and the type-level clamp moved with it. what a type now bars is the **key**, not a `null`
> value on it (`genGetConfig.integration [case28] [t3]`).

## the fork, stated fairly

a repo declares `organization` for its own reasons and wants a path that is not scoped to it.

| option | shape | cost |
|---|---|---|
| A. `org: null` forces no org | `org?: string \| null` | one branch; a third state to document |
| **B. no force-off** | `org?: string` | such a repo picks a different literal, or edits its config key |

## taken, and why — at the time

**A — keep the force-off.** it read as the escape valve for the one regression path F1 leaves
open (a weak opt-in, via a field the repo owns for its own reasons). the cost read as one `null`
branch in `getOrg`, and it made precedence total in one line.

## confidence — 70%, the lowest of the seven

the one place the design added a knob **no one asked for**. the wish never names a force-off, and
`rule.prefer.wet-over-dry` says wait for the need. i took it because the need sits one config key
away for all 6 live consumers — but it stayed speculative until a repo hit it, and it was the
cheapest of the seven to drop.

## ✅ the verdict — ruled by the wisher, 2026-09-08

> **"no force off. if they want a bare placeholder, they can set `org: '_'` or some other
> placeholder"**

⇒ **option B.** the caller cannot pass `null`. a repo that wants out of its declared org picks a
different literal.

### why the substitute is not the same knob — and is better

`org: '_'` does not reproduce what `null` did. it derives `/_/svc-x/prep/…`:

| | `org: null` (rejected) | `org: '_'` (the substitute) |
|---|---|---|
| segments derived | **3** | **4** |
| the namespace | the shared, un-scoped one | a third, private one |
| how it reads in a diff | a key set to a blank | a literal a human chose |

⇒ three consequences, and each favors B:

- **the derived shape stays uniform.** every org-aware repo derives 4 segments, always. `null`
  would have let a declared repo drop back to 3, which re-opens the very ambiguity the org
  segment exists to close.
- **the opt-out is visible.** `_` shows up in the param path, in the aws console, in the error
  text. a `null` opt-out is invisible past the call site.
- **it lands the repo somewhere, over nowhere.** `/_/svc-x/…` cannot collide with the shared
  no-org namespace, so a repo that opts out does not land back in the pool it was fleeing.

### the one-way door — raised, and ruled irrelevant

i flagged a consequence the verdict carries: a repo that declares `organization` for its own
reasons, then adopts a bare placeholder, **cannot return** to the path it derived before. `'_'`
moves it to a different namespace; it does not restore the old one.

> **"irrelevant"** — the wisher, 2026-09-08

⇒ the trade is taken with eyes open: a **uniform four-segment shape** outranks a reversible
opt-out. no artifact carries this as an open cost. closed.

### what it does NOT change

- **acceptance #2 is untouched.** a repo with no `organization` and no `org` still derives
  `/{repoName}/{choice}/{keyPath}`. that is backcompat for a repo that never opted in — a
  different case from an opt-**out**, and B removes only the latter.
- **the internal type keeps its `null`.** `getOrg` must still return `null` when no source
  supplied a value, and `asFilledConfig` threads `org: string | null`
  (`rule.forbid.undefined-inputs`). what B removes is a **caller-settable** `null` at the public
  boundary; `null` does not leave the codebase.
- **precedence stays total, one state shorter**: `org` override > config `organization` > none.

## where

`genGetConfig` input type — `org?: string`. `getOrg` — no `null` branch on the override arm.
