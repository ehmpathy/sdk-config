# F8 — `organization` is REQUIRED; its absence fails fast

> 🔴 **read F11 first.** the verdict stands and it is now total: the field is the **only** source,
> so *"neither the `org` argument nor `static.organization`"* reads as *"the config declares
> none"*. ⇒ and F11 is F8's own consequence — a required field kills the demand an override
> existed to serve, on the day it lands.

## ✅ ruled by the wisher, 2026-09-08 — and it was never best-guessed

> **"and if omitted, failfast; we can just enforce this as a required base schema"**

⇒ this row is here as a **record**, not a guess. it entered as a verdict, in answer to F1's stated
15% doubt (*"presence is a weak signal for intent"*). the fix: make absence an error, so every
declaration is deliberate.

## 🔴 what it strikes — the wish's own acceptance #2

✅ **the wish is amended on record** (2026-09-08, at the wisher's instruction). the original text is
struck rather than deleted in `0.wish.md`, so the trail shows what changed and when. this section
is why.

the wish stated, with emphasis:

> **2.** with **no** org available, it derives `/{repoName}/{choice}/{keyPath}` — byte-identical to
> today. this is backcompat, and it is the half most likely to regress unnoticed

and again at #5:

> the clamp must assert the **absent-org** case too — a test that only proves the new segment
> appears would stay green if the derive grew an org segment unconditionally, **which is the one
> regression that would break every extant repo**

⇒ **the verdict overrides both.** there is no absent-org derive to be backcompatible with, because
absent-org no longer boots. on record here rather than glossed, because a struck acceptance
criterion is a scope fact the criteria stone must inherit.

### it is coherent with the wish's *spirit*, and not with its letter

the wish feared an org segment that grows **silently**. the verdict grows it **loudly** — a repo
that lacks the field learns so at once, with a hint. so the hazard the wish named (an unnoticed
re-point of every path) is answered by the failfast, and the letter of #2 falls away with it.

## the mechanism — there is NO base schema today, so this is new machinery

verified: `genGetConfig.ts:57-62` — *"the schema is the SOLE arbiter"*. `input.schema` is the
**consumer's**, and sdk-config imposes no shape of its own on the static config
(`asStaticConfig.ts:70` returns the raw parsed file, no key dropped, no key demanded).

⇒ so a "required base schema" is a capability sdk-config does not yet have. two shapes reach the
same behavior:

| shape | the throw lands | the error reads |
|---|---|---|
| **A ✅** a required check inside `getOrg` | at the first `getConfig()`, beside every other config error | a `BadRequestError` we author, with a hint that names the field and the fix |
| B a zod base intersected with the consumer's schema | at `safeParse`, mixed with the consumer's own field errors | a zod issue on `organization`, in a list of the consumer's issues |

**A taken.** it needs no new intersect machinery, lands the error where `getRepoName`'s absent-name
error already lands, and lets the message teach both fixes — exactly as `case=4`'s refusal does.
B would bury the one actionable line among the consumer's own validation output.

⚠️ B remains the literal read of *"base schema"*. the two are indistinguishable to a consumer
except in the **error text**, so this is a phrasing call rather than a contract call.

## ✅ always, never lazy — the sub-question, ruled 2026-09-08

the verdict said *"a required base schema"*, which is clear on **what** and silent on **when**.

| | ALWAYS | LAZY |
|---|---|---|
| the rule | every config declares `organization`, full stop | demanded only where a **bare** uri needs a derive |
| a repo with 100% explicit paths and no field | ⛔ **throws** — for a value it will never read | boots, unchanged |
| the contract | 2 states: declared, or overridden | 3 states, and the third is conditional |

i took **ALWAYS** as a stated read and named the cost. the wisher confirmed it, and gave the
sharper reason:

> **"always, exactly cause lazy is a landmine"**

### why LAZY is a landmine, precisely

it is not that LAZY is loose — it is that **LAZY arms a trap and hides the tripwire**:

- a repo boots fine for months with an odd or absent `organization`, because it derives no path
- ⇒ so the field is **never validated**, and its author is never told what it feeds
- one day someone writes a bare `$.at(aws::param)` — a one-line edit, in a template, with no
  reason to think about org scope at all
- 💥 and *that* is when it fires: an unreachable path, or an org segment nobody chose

⇒ **the explosion is separated from its cause by both time and author.** the person who wrote the
bad field is not the person who trips it, and the edit that trips it looks unrelated.

### and it is exactly the defect F8 was written to kill

F8 exists to dissolve F1's weak opt-in: *"presence is a weak signal for intent."* under LAZY, the
all-explicit repo **is the one still exposed** — it carries the field, is never asked about it,
and is surprised later. ⇒ **LAZY answers the words of the verdict and leaves its reason unserved.**

### the cost ALWAYS pays, on record

an all-explicit repo throws for a value it will never read (`case=4` `[t2]`, edgecase row 2).
that cost is **real, immediate, and visible** — which is precisely what parts it from LAZY's:
deferred, invisible, and paid by someone else.

## ✅ the cost — a backwards-incompatible change with an empty blast radius, shipped as a MINOR

a newly required config field breaks every consumer that lacks it.

| population | measured | verdict |
|---|---|---|
| ahbode repos that depend on sdk-config | **6 of 6 already declare it** | zero break |
| ahbode repos overall | 16 of 48 config files declare it | out of scope — they are not consumers |
| consumers outside `ahbode/*` + `ehmpathy/*` | ✅ **none** — *"no one uses this repo yet"* | zero break |

i flagged this as a semver major and could not measure the external half. **the wisher closed it**
(2026-09-08, Q9):

> **"and no one uses this repo yet, so we'll keep it a minor version"**

⇒ the break is real and its population is empty, so a **minor** is correct: a major bump would
signal a break nobody can experience.

🟡 **that ground is a fact about today, and it expires.** the moment an external consumer adopts
`sdk-config`, a change of this shape owes a major. worth a line in the release note, so the next
author does not read this precedent as a rule.

## what it collapses, and what that is worth

- **axis B loses its `absent` value** — 4 values become 3 (declared · overridden · malformed).
  a whole region of the experience space becomes forbidden rather than live
- **`case=2` inverts** — from *"byte-identical backcompat"* to *"the absent org fails fast"*.
  the case survives, and its claim is the opposite of the one it opened with
- **`case=7`'s asymmetric adoption evaporates** — under a required field, two orgs cannot each
  adopt on their own schedule, because neither boots until it declares. the collision the wish
  exists to kill becomes **impossible**, over merely fixable
- ⇒ **the design gets simpler and the demo gets weaker.** that is the honest trade: a stronger
  guarantee, and one fewer story to tell about it

## where

`getOrg` — a `BadRequestError` when neither the `org` argument nor `static.organization` supplies
a value. `genGetConfig` — unchanged in shape; the throw travels the extant error path.
