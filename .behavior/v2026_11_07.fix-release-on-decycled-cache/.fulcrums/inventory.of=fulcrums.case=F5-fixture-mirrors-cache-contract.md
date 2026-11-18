# F5 — the refusal fixture mirrors the cache contract's positional `set`

- fork: (a) keep `set: (key, value, options?)` in `[case8] [t2]`'s fixture; (b) recast to `set: (input: { key; value }, options?)` per `rule.forbid.positional-args` (arch-opport-decomposition, 5.1 r004 blocker.1).
- taken: (a). the fixture is a stand-in for a third-party cache; `SimpleCacheSync.set` (with-simple-cache 0.17.3, `dist/domain.objects/SimpleCache.d.ts`) is `(key: string, value: T | undefined, options?) => void`. the rule exempts contracts we do not own. under (b) the fixture is refused for its FIRST param under BOTH the old and the new contract, so the `@ts-expect-error` is used either way and the clamp loses its teeth — the exact red-under-0.15.3 proof (`TS2578`) would vanish.
- rework: clean — one fixture.
- confidence: 90%.
