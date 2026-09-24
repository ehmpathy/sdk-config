# F10 — one barrel, at `contract/sdk.ts`

**rework** clean · **status** ✅ ruled by the wisher, 2026-09-13 · **where** `src/contract/sdk.ts`,
`package.json`, `blackbox/*`

## the call

> **`src/contract/sdk.ts` is the package's one export list.** `package.json` points `main` and
> `types` straight at `dist/contract/sdk.js` / `.d.ts`. there is no `src/index.ts`.

## the fork, stated fairly

`rule.forbid.barrel-exports` forbids export forwarders outright — *"totally forbidden … no export
forwarders"* — and `rule.forbid.index-ts` permits an `index.ts` in two cases only.

| option | the shape | verdict |
|---|---|---|
| **D** ✅ **ruled** | one list at `contract/sdk.ts`; `package.json` points at it | the public surface keeps its declared home, and one list cannot disagree with itself |
| B | fold `contract/` into `src/index.ts`, delete `contract/` | 🔴 **overruled.** *"why did we remove contract? contract/sdk.ts is preferred"* — it answers a bounded-context question that is the wisher's |
| A | keep both files, keep the forwarder | the violation itself |
| C | `export * from './contract/sdk'` | one line, and it is **itself** the barrel the rule bans. it trades a named defect for an unnamed one and makes the public surface implicit |

## 🔴 why it is a blocker, not a tidiness item

the rule's predicted harm **landed in this diff**: `OrgSlug` and `RepoSlug` reached one export list
and not the other, so a consumer could import neither while **189 tests, `lint`, and every `src/`
compile stayed green**.

⇒ two lists agree only by hand, and a hand fails silently — the consumer is the first to find out.
ONE declaration leaves the disagreement no place to live, and that is the whole repair.

## why the rework is CLEAN

a file move plus an entrypoint repoint, with a byte-identity clamp that already exists: both
`blackbox/*` suites import 10 named exports through the entrypoint, so `types` plus those two
suites prove the surface held.

⇒ the ripple, measured: **4 file moves** (`sdk.ts`, its acceptance suite, its snapshot dir, and
two `blackbox` import lines) and two `package.json` keys.

## 🟡 the doubt that made this a council row

it was raised as a **deferral** — SAFE ✅ / CLEAN 🔴 — and the CLEAN grade was wrong: the ripple
was 4 file moves, not a restructure. two enrolled peer lanes contested the grade unprompted
(*"it's cheap, fully clamped"*), and both were right.

⇒ but the row was **not** the council's on the strength of its grade. `rule.always.defer-fulcrums-to-last`
says the `rework` column decides who rules, and `clean` is the driver's:

> *"are these dirty fulcrums? if not, go on"*

⇒ **the driver took it, and took the wrong option.** i read a peer's *"contract isn't worth its
place"* as a settlement of the bounded-context question the row had reserved — which is exactly
what `rule.always.raise-a-blocker-a-taken-cannot-close` forbids: *"to argue an itemized fulcrum
down settles by side effect a question you reserved, and the wisher never learns it was asked
twice."*

## the lesson, stated for the next traveler

a `clean` rework is the driver's to **execute**. it is not the driver's to **re-decide** where the
row reserved a named question for the wisher.

⇒ the two are separable: take the fix, and hand up the question with it.
