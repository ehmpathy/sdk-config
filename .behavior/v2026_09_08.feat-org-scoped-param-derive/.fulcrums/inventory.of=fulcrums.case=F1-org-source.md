# F1 — where the org comes from

> 🔴 **read F11 first.** option **A stands, alone.** the *"with D as the override that wins over
> it"* half is cut: `genGetConfig` has no `org` key, and `getOneOrg` reads
> `{ static }` with no precedence arm. ⇒ D was never demanded — the wish asked for a declared
> source and said naught of an override — and it is the row F11 itemizes the cost of.

## the fork, stated fairly

the wish's acceptance #4 demands a *declared source*, and names two candidates plus an invitation
to find a third.

| option | zero-config? | presence = intent? | drift risk |
|---|---|---|---|
| **A. static config top-level `organization`** | yes for 6/6 ahbode sdk-config consumers, which already carry it (16 ahbode repos carry it in all) | weakly — the field predates this use | repeated per choice file; could diverge |
| B. package.json `repository` / `homepage` owner | yes, **universally** | no — every repo has it | none (one manifest) |
| C. package.json `name` npm scope (`@org/pkg`) | only for scoped packages; neither cited repo is scoped | yes | none |
| D. override argument alone | no | yes | none |
| E. an envar (e.g. `SDK_CONFIG_ORG`) | yes, per deployment | yes | high — invisible in the repo, set per environment |

**E was surfaced by the assumptions review**, never by the issue — it belongs here because
"declared source" does not by itself mean *in-repo*. rejected: an envar is invisible to a reader
of the repo, must be set per deployment surface (lambda, cicd, laptop), and a shared template
cannot ship it. it also re-creates the very drift the config field avoids.

## taken, and why — at the time

**A (config `organization`), with D as the override that wins over it.**

- **B is disqualified by presence.** the org would be available for *every* repo, so every bare
  placeholder in existence would silently re-point from `/{repo}/{choice}/…` to
  `/{org}/{repo}/{choice}/…`. that is precisely the regression the wish flags as "most likely to
  regress unnoticed". an implicit source whose presence is universal cannot be opt-in.
- **C covers too little** — `svc-notifications` and `sdk-config` both ship unscoped names, so the
  scope is absent exactly where the evidence lives.
- **A's presence is at least a deliberate authored line**, and the measured blast radius of the
  flip is empty: **not one repo in `ahbode/*` or `ehmpathy/*` uses the bare `$.at(aws::param)`
  form today** (30 usages found, all explicit). so no extant derive can change.
- **A is already the org's convention** — 16 ahbode services declare `organization: "ahbode"`,
  and that set covers all 6 that depend on sdk-config today.
  ubiqlang says adopt the domain's word, never invent a second one.

## confidence — 85% at the time, and the 15% was the weak opt-in

a repo could carry `organization` for its own reasons and later adopt a bare placeholder, and get
an org segment it never asked for. presence of the field was a **weak signal for intent**, because
a repo could hold it with no thought at all about param paths.

## ✅ the verdict — ruled by the wisher, 2026-09-08

> **"yes! A ✅ taken — the config's organization field. beautiful. and if omitted, failfast; we can
> just enforce this as a required base schema"**

⇒ **option A confirmed, and the 15% doubt is dissolved rather than accepted.**

### why the second clause answers the first

the doubt was *"presence is a weak signal for intent."* the fix is not a better source — it is to
make **absence an error**:

| | presence, before | presence, after |
|---|---|---|
| a repo with the field | may hold it for its own reasons | holds it because sdk-config demands it |
| a repo without it | derives a two-segment path | ⛔ **fails fast** |
| what a declaration means | *"i happen to model my org"* | *"this is my param namespace"* |

⇒ **every `organization` in a sdk-config consumer becomes a deliberate declaration**, because no
config boots without one. the weak opt-in cannot exist, since no implicit path is left for it to
fire on. ⇒ **F1 goes to ~100%** — the one reason it sat at 85% is gone by construction.

### and it moots the alternatives it was ranked against

- **B (package.json owner)** was disqualified because its presence is *universal*, so it could not
  be opt-in. under a required field, A's presence is universal **too** — but deliberately, and
  authored per repo. B's other defects (no per-repo intent, one manifest for every choice) still
  hold, so A stays the pick.
- **D (nest under `sdkConfig.organization`)** was the "stronger design, at the cost of a migration
  for every consumer." ⚠️ that cost now applies to A as well — a required field **is** a migration
  for every consumer that lacks it. ⇒ the two options draw closer, and A still wins on ubiqlang
  (it is the domain's own word) and on the measured 6-of-6 that already declare it. F8 carries the
  full record of what the requirement costs.

## where

`getOrg` (new) reads `input.override ?? static.organization`, and **throws when neither supplies
one** (F8); `genGetConfig` passes it into `asFilledConfig` → `asSdkConfigPath`.
