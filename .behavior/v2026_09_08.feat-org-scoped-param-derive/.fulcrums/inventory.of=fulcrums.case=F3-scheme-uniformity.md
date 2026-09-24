# F3 — does the org segment apply to every scheme, or to `aws::param` alone?

## the fork, stated fairly

the wish speaks only of `$.at(aws::param)`. but `asSdkConfigPath` is scheme-agnostic — line 47
never reads `uri.scheme` — so `aws::secret` derives by the same rule today
(`blackbox/sdk-config.acceptance.test.ts:72` proves it: `/acceptance-test-svc/prod/api.key` from
a bare `$.at(aws::secret)`).

| option | effect |
|---|---|
| **A. uniform** — org applies to every auto-derived scheme | one mental model; secrets move too |
| B. `aws::param` only | narrower blast radius; a scheme-conditional derive, and two shapes to hold in mind |

## taken, and why — at the time

**A — uniform.**

- the derive is one rule today; a scheme branch would be the first place the shape forks, and
  a fork invites drift as schemes are added.
- an org namespace is a property of the *repo*, never of the store it reads from — a
  scheme-conditional org would be an odd claim.
- the same backcompat guarantee covers both: no org declared ⇒ no change, either scheme.

## confidence — 80%

the wish never names secrets, so this widens its literal scope. it is checkable and cheap to
narrow later (one branch), and narrower-than-uniform would be the surprise the day someone moves
a secret and finds the org absent.

## ✅ the verdict — ruled by the wisher, 2026-09-08

> **"yes to each"** — F2, F3, F7, ruled together at the close.

⇒ **option A stands: the org applies to every auto-derived scheme.**

### it is the NO-CODE answer, and F8 sharpens that

`asSdkConfigPath` never reads `uri.scheme` — there is no scheme branch in the file. so uniform is
what the code already does; **option B would have been the added branch**, never the default.

⇒ and F8 removes the last conditional from that seam: the org is non-nullable by the time it
arrives, so the derive is **one template, no branches at all**. a scheme carve-out would be the
sole `if` in the operation, which is exactly the shape `rule.avoid.unnecessary-ifs` bars.

⚠️ the widening is real and it stays on record: a repo that moves a **secret** now gets an
org-scoped path too, and the wish never named secrets. it is one line to narrow if a later stone
finds a reason.

## where

`asSdkConfigPath.ts:47` — the single derive line. no branch is added, which is the point.
