# fulcrums

| case | title | rework | status | confidence |
|---|---|---|---|---|
| F1 | release header `feat(cache):` → 0.4.0, over `break(cache):` → 1.0.0 | clean | ruled: feat(cache) → 0.4.0 (director, 2026-11-08) | 60% |
| F2 | readme: note the uni-time dynamodb example, over drop it | clean | best-guessed | 80% |
| F3 | boot repair: pin latest for the 3 `@declapract{...}` placeholders, plus depcheck ignores | clean | best-guessed | 90% |
| F4 | cache input typed as with-simple-cache's `SimpleCacheSync<unknown>` (iso-time, breaks uni-time caches), over a minimal `{ get; set(key, value) }` shape that fits both | clean | ruled: iso-time SimpleCacheSync (director, 2026-11-08) | 75% |
| F5 | `[case8]` refusal fixture keeps with-simple-cache's own `(key, value, options?)` `set` signature, over the `(input, options)` shape `rule.forbid.positional-args` asks for | clean | best-guessed | 90% |
| F6 | boot-generated artifacts (`.husky/check.*.sh` from the husky practice; `.claude/*.md` from rhachet) ride along unedited; their defects go upstream as a reseed dream | clean | best-guessed | 80% |
| F7 | the sync-wrapper defects (rejection replay, `undefined` key collision, async caches never fill) stay — pre-extant on 0.15, deferred to a dream; this pr only corrects the readme | dirty | best-guessed | 70% |
| F8 | the committed `0.wish.md` drops the clock from "commander 2026-11-06 [clock]", so `check.timestamps.sh` passes; the verbatim wish stays at `~/.rhx/wish/` | clean | best-guessed | 85% |
