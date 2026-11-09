# F7 — sync-wrapper cache defects deferred

- fork: (a) fix in this pr: `withSimpleCache` → `withSimpleCacheAsync`, input `SimpleCache<unknown>`, plus an explicit cache key (enroll-impl-arch-defects, 5.1 i003 r011 blocker.1-2); (b) defer to a dream, correct only the readme.
- evidence (tsx probes, 0.17.3 and 0.15.1 alike): a rejected fill is replayed (`call2 -> replayed transient`, 1 fill run); two zero-arg `genGetConfig`s on one shared cache collide (`a -> A b -> A`); an async cache never fills (`undefined`, 0 fill runs). all three reproduce on with-simple-cache 0.15.1 — pre-extant, not introduced here.
- taken: (b). the director ruled F4 as "iso-time `SimpleCacheSync`, per the wish"; the swap needs `SimpleCache<unknown>`, a different contract than the one ruled. the wish is nano. the readme lines this pr wrote were false (they implied dynamodb works after an iso-time release) and are corrected here.
- the reviewer's probe (5.1 i004 r011), which refutes an earlier rationale here: `withSimpleCacheAsync` (0.17.3) accepts a sync cache, dedups concurrent cold calls via an in-memory promise cleared in `.finally`, stores no rejected fill, and fills an async cache. so the swap's only observable change is "a failed fill is no longer replayed" (plus async caches work). that makes it a clean follow-up, not a semantic risk.
- rework: clean for the wrapper (two lines + tests); the key fix touches every shared-cache adopter's entries once.
- confidence: 70%. the rejection replay is a real prod hazard (a transient aws throttle sticks for the cache ttl); the wisher may want it next.
- dream: `.dream/v2026_11_08.fix.sdk-config-cache-wrapper-async-safe.md`
