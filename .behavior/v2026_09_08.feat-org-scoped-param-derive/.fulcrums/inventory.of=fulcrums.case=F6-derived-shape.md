# F6 — the derived shape follows the wish literally

## the fork, stated fairly

the wish states the target: `/{org}/{repoName}/{choice}/{keyPath}`. the params that actually
exist in the wild carry **neither** the `{choice}` segment **nor** a dot-joined keyPath:

```
in the store today   /ahbode/svc-notifications/database/role/cicd/for-plan/password
in the store today   /ahbode.svc-notifications.dev.database.role.crud.password
this wish derives    /ahbode/svc-notifications/prep/database.role.cicd.for-plan.password
```

| option | shape |
|---|---|
| **A. follow the wish literally** | org · repo · choice · dot-keyPath |
| B. match the org-scoped params that exist | org · repo · slash-keyPath (no choice) |
| C. make the shape configurable | any of the above, per repo |

## taken, and why — at the time

**A — follow the wish literally.**

- `.what` / `.acceptance` are authoritative (`rule.require.wish-outcome-over-proposal`); the
  shape is stated there, not inferred by me.
- B would drop `{choice}`, which is a **regression for every extant derive** — today's two-segment
  form already carries choice, and two environments would collide on one param.
- C is a knob no one asked for, and it re-opens the shape question in every repo.
- the wish is explicit that **no param moves** in this behavior. so the mismatch is expected: the
  move is the downstream ask this unblocks, never part of it.

## confidence — was 78%, now **ruled**

the doubt was never about the shape; it was about whether the wisher knew the shape matches **no**
param in the wild, so a bare placeholder still misses until each param is moved. surfaced as open
question **Q3**.

## where

`asSdkConfigPath.ts:47` — the derive template.

## the verdict — ✅ **A stands, ruled by the wisher (2026-09-08)**

> *"we want this shape basically — `/ahbode/svc-notifications/prep/database.role.cicd.for-plan.password`
> … and we'll get everyone else to adhere."*

the mismatch is **the point, not a defect**: the derived shape is the **target convention**, and
the params in the wild are what migrates to it. the org prefix and the slash-joined
`org/repo/choice` prefix are both wanted, `{choice}` stays, and the dot-joined keyPath stays.

⇒ the confidence rises to **100%** on the shape, and the doubt behind the 78% is discharged rather
than deferred: the wisher knew, and the follow-on move is theirs to drive. this behavior is
**necessary and deliberately not sufficient** — it ships the convention that the migration then
targets.
