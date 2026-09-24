# F2 — what a malformed `organization` does

## the fork, stated fairly

`organization` is present but is not a literal non-empty string — an object, a number, `""`, or a
`$.at(...)` placeholder (the org is read from the **static** config, before any fill).

| option | behavior | cost |
|---|---|---|
| **A. throw** `BadRequestError` at derive | loud, names the value + both fixes | a repo with a non-string `organization` **and** a bare uri newly throws |
| B. treat as absent | derives the no-org path | a wrong-but-present value at the no-org path is handed back quietly — a failhide |
| C. splice it in as-is | derives a nonsense path | worst: an unowned path, an opaque miss |

## taken, and why — at the time

**A — throw.**

- B's quiet fallback is the exact shape `rule.forbid.failhide` bars: the config asked for one
  path, the code read another, and no one is told.
- A's cost is bounded and measured: it fires only where a bare uri is actually derived, and **not
  one repo in `ahbode/*` or `ehmpathy/*` uses a bare uri today**. a repo with an odd
  `organization` and only explicit paths never trips it (`case=4` `[t2]`).
- the throw teaches the fix — a literal, or `genGetConfig({ org })`.

## confidence — 75% at the time, the lowest of the open three

sdk-config would start to **judge a config key it does not own**. `organization` is the consumer's
field; 16 ahbode repos declare it for their own schema. a future repo that models it as
`{ name, id }` would be told its own config is wrong. the counter: the judgment is narrow and loud
rather than silent.

## ✅ the verdict — ruled by the wisher, 2026-09-08

> **"yes to each"** — F2, F3, F7, ruled together at the close.

⇒ **option A stands: a malformed `organization` throws.**

### the 25% doubt is smaller than it was, and F8 is why

the doubt was that sdk-config judges a key it does not own. **F8 already moved past that line** —
it does not merely judge the key's *shape*, it demands the key's *presence*. so a shape check is
no longer the first imposition; it is the second, and the smaller one.

⇒ and the two now compose into **one rule with one error site**: `getOrg` refuses an absent org
and a malformed one at the same moment, before any store read. a reader learns one contract rather
than two.

⚠️ **the narrowness argument in `.taken` no longer holds, and the verdict survives it.** i wrote
that A *"fires only where a bare uri is actually derived"* — under F8 the org is read whether or
not a derive needs it, so a malformed value in an all-explicit repo throws too (`case=4` `[t2]`,
inverted). the cost is real and larger than i priced it; the failhide that B would create is what
still rules it out.

## where

`getOrg` (new) — the guard sits there, and `asSdkConfigPath` then receives a validated `string`
only, never a malformed value and never a `null`.
