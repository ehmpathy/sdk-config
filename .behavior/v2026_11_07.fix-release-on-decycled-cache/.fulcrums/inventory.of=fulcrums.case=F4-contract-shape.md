# F4 — cache contract shape

- fork: (a) `cache: SimpleCacheSync<unknown>` from with-simple-cache 0.17.3 — iso-time; uni-time caches refused (c3, c4). (b) a minimal structural `{ get: (key: string) => unknown; set: (key: string, value: unknown) => void }` — sdk-config never passes an expiration itself, so both glossaries fit and no break ships.
- taken: (a). the wish and issue #14 ask for the contract "in the iso-time glossary" and pre-name the break; (a) reuses with-simple-cache's own term (ubiqlang) over a private shape.
- rework: clean — one type line in `genGetConfig.ts`, plus case8 [t1] flips from refused to accepted.
- confidence: 75%. (b) would spare c4's simple-dynamodb-cache adopters; only the wisher can weigh that against one contract vocabulary.

## verdict

ruled by the director, 2026-11-08: (a) iso-time `SimpleCacheSync`, per the wish. uni-time caches are refused (c3, c4).
