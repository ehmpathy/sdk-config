# decision: safeParse is the sole arbiter (no schema-walk)

## .what

when a config value cannot be read (denied or absent), `asFilledConfig` leaves it
`undefined` in place and records the miss. `genGetConfig` then hands the whole filled
config to `schema.safeParse` — and lets zod alone decide pass-or-fail. there is no
hand-written optionality oracle, no `z.toJSONSchema` derivation, no per-keyPath walk of
the schema's `required[]`.

## .why this over the walk

an earlier iteration proposed a pre-fetch schema-walk: derive a json-schema, then for
each unreadable keyPath decide tolerate-vs-throw by hand before validation. that design
was heavier and, worse, some of its "rescues" discarded data we never intended to drop.

plain `safeParse` already encodes every tolerance rule correctly, because each zod mark
has a precise stance on `undefined`:

| schema mark | accepts `undefined`? | verdict on an unreadable value |
|---|---|---|
| `.optional()` | yes | tolerated (key omitted) |
| `.nullish()` | yes | tolerated (key omitted) |
| `.default(x)` | yes → default fires | tolerated (default applies) |
| required (bare) | no | hard fail (correct) |
| `.nullable()` only | no (accepts `null`, not `undefined`) | hard fail (correct) |

the two subtle shapes the walk tried to "rescue" both prove fail-loud is the right call:

- **ancestor-optional, leaf required** — a *present* optional object must satisfy all its
  required children. the walk dropped the whole optional node to force a pass, which would
  also discard any readable peer inside it. fail-loud is correct; the fix is to mark the
  *leaf* optional, not the ancestor.
- **optional array, one element denied** — the walk dropped the whole array to force a
  pass, a silent loss of the readable peer elements. fail-loud is correct; the fill keeps
  every element and the schema rejects the one undefined-required field.

net: an unreadable value is `undefined` (never fabricated as `null`), and `safeParse`
renders the correct verdict for every shape on its own. no walk, no oracle, no drift.

## .proof (executable, in our own operations)

this decision is not asserted against zod in isolation — it is proven end-to-end through
*our* code. each tolerance shape has a live regression test at the pipeline level:

| shape | proven by |
|---|---|
| flat optional denied → tolerated | `genGetConfig.integration.test.ts` case13 |
| required denied → hard throw (failfast env) | `genGetConfig.integration.test.ts` case14 |
| required denied → hard throw (prod/cloud too) | `genGetConfig.integration.test.ts` case15 |
| ancestor-optional, required leaf → hard throw | `genGetConfig.integration.test.ts` case16 |
| nullable-only denied → hard throw | `genGetConfig.integration.test.ts` case17 |
| optional-with-default denied → default applies | `genGetConfig.integration.test.ts` case18 |
| nullish denied → tolerated (omitted) | `genGetConfig.integration.test.ts` case19 |
| optional absent (not-found) → tolerated | `genGetConfig.integration.test.ts` case20 |
| optional array, one element denied → keep both, schema rejects | `asFilledConfig.test.ts` case9 |

## .note

an earlier draft locked this via a standalone unit test
(`toleranceViaSafeParse.decision.test.ts`) that called `zod.safeParse` directly. it was
removed: it asserted a dependency's behavior rather than our own, and every shape it swept
is already proven through the operations above. this ref preserves the *why*; the tests
above preserve the *proof*.
