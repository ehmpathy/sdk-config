# F9 — `OrgSlug` / `RepoSlug` in contracts, and `repoName` → `repo`

**status** ✅ ruled by the wisher, at execution · **rework** clean · **confidence** 97%

## the fork, stated fairly

the wisher raised it directly, mid-drive, in three fragments:

> *"should we call tem OrgSlug and RepoSlug ?"* · *"in contracts"* · *"where the alias is org, repo"*

⇒ two coupled calls, not one:

| # | the call | its cost |
|---|---|---|
| A | name the two path segments as **types** — `OrgSlug`, `RepoSlug` — and export them | additive. free |
| B | rename the **key** `repoName` → `repo`, so the pair is symmetric | 🔴 a key published in `v0.2.3` |

## what i took, and why at the time

**A: taken outright.** three of the derive's four segments now carry the suffix —
`/{OrgSlug}/{RepoSlug}/{EnvironmentConfigSlug}/{keyPath}` — and the third was already typed that
way by `sdk-environment`. so the wisher's proposal completes a pattern the signature had started
rather than introduce one. it also closes a live `rule.prefer.symmetric-term-pairs` violation:
the concept had **three** spellings (`organization` the field, `org` the argument, `repoName` its
partner).

**B: i first proposed a SUBSTITUTE, and the wisher struck it.** i offered an additive `repo` plus
a `@deprecated repoName` alias, to keep the change compatible, and asked which way to rule.

⇒ 🔴 **two verdicts came back, and both corrected me:**

> *"hardcuts are fine. no one uses these yet."* — so the alias is the reversibility hedge this
> wisher rejects, and the consumer set is empty.
>
> *"we'll keep it minor."*

⚠️ **and my "MAJOR" grade was wrong on its own terms.** the package sits at **`0.2.3`**, and
semver permits incompatible changes in a `0.x` minor outright. i verified the key WAS published
(`git show 027b68d:…/genGetConfig.ts` → `repoName?: string`) and never checked the major, so i
raised a collision that did not exist. **publication and breakage are two different questions.**

## rework — clean

both halves are: `OrgSlug`/`RepoSlug` are plain aliases, so a later brand or a rename is a
type-level edit; the key rename is mechanical (`sedreplace`, ~140 sites) and fully clamped by the
suite. no caller outside this repo exists to harden against either.

## confidence — 97%

the 3%: the two types are **aliases, never brands**, so they buy legibility and autocomplete and
claim **no** validation. that was my call, not the wisher's — they said *"types"* and not which
kind. i took the alias because `getOneOrg` deliberately leaves the charset unchecked (its own
`.note`), so a brand would promise a guarantee no operation performs.

⇒ 🟡 **a brand is a real and different decision**, and it wants two items this change does not
have: an `isOrgSlug.assure()` (`rule.require.assure-via-type-checks`) and a verdict on what
charset an org may hold — which is **F7**, already ruled *no charset gate*. ⇒ so the alias is the
choice consistent with F7, and a brand would reopen it.

## where

`src/domain.objects/OrgSlug.ts` · `src/domain.objects/RepoSlug.ts` (new) ·
`src/contract/sdk/index.ts` (exported) · `genGetConfig` · `asSdkConfigPath` · `asFilledConfig` ·
`getOneOrg` · `getOneRepo` (renamed from `getOneRepoName`) · ~140 test call sites · `readme.md`

## the verdict, once ruled

✅ both halves taken, hard cut, ships MINOR. gates after: `types` ✅ · `format` ✅ · `lint` ✅ ·
`unit --thorough` **113 passed** · `integration --thorough` **76 passed, 3 failed** (the same
prior IAM write-grant gap, unchanged by the rename).

## 🟡 one cost found on application, worth the note

a blanket `sedreplace` of the old key **rewrote the two new jsdocs that had to NAME it** —
`RepoSlug.ts` briefly read *"the key is `repo`, never `repo`"*. repaired, and a `⛔` warn now sits
in that file so the next sweep does not redo it.

⇒ the general shape: **a rename tool cannot tell a use of a term from a mention of it**, and the
files most likely to mention it are the ones that document the rename.
