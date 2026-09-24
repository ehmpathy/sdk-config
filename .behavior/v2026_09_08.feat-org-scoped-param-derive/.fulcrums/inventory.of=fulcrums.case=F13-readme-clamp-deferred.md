# F13 — the readme's config examples are FIXED, and the clamp that would keep them fixed is DEFERRED

- **rework** = clean
- **status** = best-guessed, open to the council
- **confidence at the time** = 82%
- **taken** = 2026-09-18, at `5.3.verification`, self review `r7.has-ergonomics-validated`

## the fork, stated fairly

F8 made `organization` a **required** config field. two of the readme's four yaml config examples
declared none, so each throws on the first `getConfig()` when copied as written:

| block | what it is | the reader it fails |
|---|---|---|
| `readme.md:21` | the **quickstart** — the first code block in the file | every new adopter |
| `readme.md:160` | the **explicit path example** | 🔴 the all-explicit repo, which is the exact population Q8's `always` charges for a value they never read |

the fork is not *whether to fix them* — that was safe, clean, and done in the same gate. it is:

> **do we also land the CLAMP that would have caught them, here, in this behavior?**

| option | what it costs | what it buys |
|---|---|---|
| **A — fix only** *(taken)* | the class can recur on the next required field | the two live defects are gone, and the diff stays inside the wish's scope |
| **B — fix + clamp** | a new test file, a markdown-fence parser, and a **fragment-exemption convention that does not exist** | the class cannot recur |
| **C — fix + a note in the readme** | drift, silently, the moment someone forgets to read it | near-zero |

## why A, and why at the time

the SAFE/CLEAN test (`rule.always.fix-forward-under-scouts-honor`), applied to the **clamp** rather
than to the fix:

- **safe?** ✅ a doc test touches no runtime path
- **clean?** 🔴 **no.** it needs three decisions this wish never scoped:
  1. a markdown-fence parser (a new dependency, or hand-rolled)
  2. a **fragment exemption** — some blocks show one key, not a whole config, so a naive clamp
     reddens on a correct doc
  3. the scope — readme only, or every `*.md`? a wider sweep reddens on docs that quote errors

⇒ the fix is **in** the wish (a config example that throws is an ergonomics defect this behavior
created); the clamp is a **repo-wide practice decision**
(`rule.always.scope-onetime-lessons-to-the-behavior`).

## why it is a FULCRUM and not a dream alone

`rule.always.fix-forward-under-scouts-honor` is explicit: a fix deferred for **DIRT** owes both.

| artifact | records |
|---|---|
| the dream — `.dream/2026_09_18.clamp-readme-config-examples-declare-organization.dream.md` | the **work**: the test's shape, the two open calls, the evidence |
| 🔴 this row | the **decision**: that i saw the class, judged the clamp dirty, and chose to defer |

⇒ a dream alone reports the work and hides the call. the dirt grade is my estimate of ripple cost,
made alone, and that estimate is what the council may overrule.

## why 82%, and why it is not higher

the 18% is one specific doubt, and i will name it rather than round it away:

🔴 **this is the SECOND time a readme defect reached a verification gate on this route.** the doc
drifted from the code at execution and was caught by a human read, twice — once for each block. two
instances is the point at which *"a lesson"* becomes *"a pattern"*, and a pattern is what earns a
mechanism.

⇒ so the honest counter to A is: **the clamp is dirty today and the class has already recurred
once.** if the council reads the recurrence as the stronger signal, B is right and my dirt grade was
the wrong lens.

what holds me at A anyway: the fragment-exemption convention is a **real** unscoped decision, and to
invent one inside a param-derive behavior is how a wish's scope leaks. the dream carries the shape,
so the next author pays no re-derivation.

## the rework, if the council overrules

**clean.** the two fixes are already landed and stand on their own; option B is purely additive — a
new `readme.test.ts` plus a fence convention. no caller is hardened against A, and no later stone is
built on it. reversal is an addition, never a teardown.

## where

- fixed: `readme.md:21-32` (quickstart + callout) · `readme.md:160-169` (explicit example + callout)
- the dream: `.dream/2026_09_18.clamp-readme-config-examples-declare-organization.dream.md`
- symlinked at: `.behavior/v2026_09_08.feat-org-scoped-param-derive/dreams/`
- found by: `review/self/for.5.3.verification._.r7.has-ergonomics-validated.md`

## the verdict, once ruled

*(open)*
