# F4 — the term for the new input, and the shape of its source

> 🔴 **read F11 first.** the term `org` stands; the public **input** does not. there is no
> `genGetConfig({ org })` — the config's `organization` field is the one source, and the op reads
> `getOneOrg({ static })`. ⇒ **F4's one recorded cost is gone with it**: a two-form error that
> names which source supplied a bad value exists only where two sources do.

⚠️ **this file is the one place both candidate terms must survive verbatim**, since it records the
fork between them. ⛔ do NOT run a repo-wide rename pass over it — one flattened this file into
`"the term is org, never org"` already, and this note is what bars the next.

## the fork, stated fairly

| option | public input | source transformer |
|---|---|---|
| A. `orgName` | `genGetConfig({ orgName })` | `getOrgName({ override, static })` |
| B. `organization` | `genGetConfig({ organization })` | `getOrganization(...)` |
| C. `orgSlug` | `genGetConfig({ orgSlug })` | `getOrgSlug(...)` |
| **D. `org`** ✅ | `genGetConfig({ org })` | `getOrg({ override, static })` |

**D was absent from the first table** — i reached for symmetry with `repoName` and never asked
whether the `…Name` suffix earns its place on this term. it does on `repoName`, where it
disambiguates package.json's `name`. there is no such collision for the org.

## taken, and why — at the time

**A — `orgName`**, on symmetry with the extant `repoName` at every layer: the public input
(`genGetConfig.ts:24`), the internal arg (`asFilledConfig.ts:28`), the transformer input
(`asSdkConfigPath.ts:30`), and the source op (`getRepoName.ts:18`).

## the verdict — ✅ **D, ruled by the wisher (2026-09-08)**

> *"can we just call it `org` instead of `orgName`"*

the term is **`org`**, the source op is **`getOrg`**, and the derived path reads
`/{org}/{repoName}/{choice}/{keyPath}`.

**why the verdict is right, and my 90% was aimed at the wrong risk.** i held the residual doubt on
*"is `organization` / `orgName` a near-pair a reviewer misreads as synonym sprawl?"* — the real
question was simpler: **does the `Name` suffix carry information here?** it does not. `repoName`
earns its suffix by contrast with package.json's `name`; the org has no competing `name` to
disambiguate, so `orgName` was symmetry for its own sake. `org` is the shorter word for the same
concept, and `rule.require.brevity` prefers it where no sense is lost.

⇒ applied across every vision artifact: **46 sites** for the term, **7** for the op. `0.wish.md` is
**not** rewritten — the wisher's words stay verbatim, and it carried the old term only as advisory.

## 🔴 the one cost the rename carries, found on application

**the new term is a substring of `organization`.** that matters because F4's sibling contract
(raised in peer round 1) is that a malformed value's refusal must **name the source it read from**,
so a caller who passed a bad argument is not sent to edit a config field they never wrote.

```ts
expect(error.message).toContain('org');              // ⛔ holds on 'organization' too — proves naught
expect(error.message).not.toContain('organization'); // ⛔ and these two now contradict
```

under option A the two source names were disjoint, and a bare substring check sufficed. under D it
does not.

⇒ **the constraint this adds, now on record**: the error must name each source in a form that tells
them apart — *the `org` argument* vs *the `organization` field* — never the bare word. `case=4`'s
two assertions are rewritten accordingly, each with the trap noted inline so a later author does
not "simplify" them back.

this is a real cost, and it is small: one line of error text, two assertions. it does not move the
verdict.

## where

`getOrg.ts` (new, beside `getRepoName.ts`); `asSdkConfigPath` gains `org: string | null` (a
required, nullable internal key — `rule.forbid.undefined-inputs`); `genGetConfig` gains
`org?: string` at the boundary, beside `repoName?`.

⚠️ **the two types differ, and F5 is why.** the internal key is nullable because `getOrg` must
report *"no source supplied one"*; the public key is not, because a caller may not **ask** for
that state (F5, ruled — no force-off). so `null` is an internal absence, never an input.

⚠️ **the asymmetry with `repoName` is now deliberate, and worth one line in the code**: the two
inputs sit side by side and are named on different rules (`repoName` disambiguates, `org` has
nothing to disambiguate from). a future reader will otherwise read it as an oversight.
