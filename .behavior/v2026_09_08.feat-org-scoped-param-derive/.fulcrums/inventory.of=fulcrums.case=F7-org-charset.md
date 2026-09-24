# F7 — the org's charset is unchecked

surfaced by the assumptions review, never by the wish.

## the fork, stated fairly

F2 settles the *type* of `organization` — a literal non-empty string, or none. it says not one
word about the string's **charset**. so:

| option | a `"acme inc"` org derives | the error a human reads |
|---|---|---|
| **A. no charset gate** (taken) | `/acme inc/svc-x/prep/…` | aws rejects the param name; the store error carries the path |
| B. gate on the ssm charset `[a-zA-Z0-9_.\-/]` | throws at derive | names the bad char and the field, before any aws call |

the case that makes this real: `organization` is the **consumer's** field, and sdk-config does not
own its schema. a repo may legitimately carry a *display* name there — `"Acme Inc"`, `"ahbode, llc"` —
because until this wish, no path was derived from it. F2's type rule admits every one of those.

## taken, and why — at the time

**A — no charset gate.**

- **its twin has no gate either.** `getRepoName.ts:18-56` hands back package.json `name` verbatim,
  and `asSdkConfigPath.ts:47` splices it raw. a charset gate on the org alone would leave one
  segment validated and its neighbour not — an asymmetry the next reader trips on, and a rule this
  wish never asked for.
- **the failure is loud, and it is not silent corruption.** aws returns a name-validation error;
  `genSdkConfigSupplierAwsParameterStore.ts:53-60` surfaces it with the derived path, and
  `genGetConfig.ts:71-88` re-raises it as a blocker with the key. a human sees the bad path
  verbatim.
- **the scope bound.** the wish asks for an org segment, not a validator for the two segments that
  already exist.

## confidence — 80%, and why not higher

the 20%: the error lands one layer from its cause. a human reads a **store** error about a param
name, when the true fault is a **config field** three files away. B costs one regex and would name
the field — and the same gate could later cover `repoName`, which is a strictly better world.

it stays taken because B, applied to the org alone, buys precision for one segment and leaves the
identical hole in the other.

## ✅ the verdict — ruled by the wisher, 2026-09-08

> **"yes to each"** — F2, F3, F7, ruled together at the close.

⇒ **option A stands: no charset gate. the org is spliced as declared.**

### the symmetry argument survived every other verdict, which is the tell

F2 and F8 each moved the line on *how much sdk-config may demand of a key it does not own* —
first its shape, then its presence. **F7 was the one row that did not move**, and its reason is
why: the argument is not about how much we may demand, it is that a gate on **one** of two
adjacent segments leaves the other unchecked.

⇒ `getRepoName.ts:18-56` still hands back package.json `name` verbatim, and
`asSdkConfigPath.ts:47` still splices it raw. that hole is untouched by every verdict here, so a
gate on the org alone would still buy precision for one segment and leave its neighbour open.

⚠️ **the 20% doubt stands, and it is worth a dream later**: a human reads a *store* error about a
param name, when the true fault is a *config field* three files away. the better world gates
**both** segments in one op — out of scope for this wish, and a clean follow-up.

## where

`getOrg` (new) — B remains one added refusal beside F2's, with no other file touched.
