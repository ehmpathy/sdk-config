# F1 — release bump level

- fork: `feat(cache):` (0.3.0 → 0.4.0) vs `break(cache):` (0.3.0 → 1.0.0).
- taken: `feat(cache):`. semver treats 0.x minors as breaks; the repo has shipped 0.x breaks as minors. the pr body names the break.
- rework: clean — a header edit before merge.
- confidence: 60%. the wish says "the semver bump it owes" and leaves the level to the commander. against 0.4.0: `commitlint.config.js` says "use break: instead of feat!: or BREAKING CHANGE footer" — the house names `break:` as the header for a break. for 0.4.0: #16 shipped a break as `feat` → 0.3.0, and 0.x minors are semver breaks.
- where: commit header + pr body.
- ⚠️ never `feat!:` — `please-release/action.yml:183` regex misses the `!` and mints a patch.

## verdict

ruled by the director, 2026-11-08: `feat(cache):` → 0.4.0. the pr body names the break.
