# F3 — boot repair scope

- fork: pin real versions for `rhachet-brains-openrouter`, `rhachet-roles-bhrowser`, `rhachet-roles-ghlitch` (written as raw `@declapract{check.minVersion(...)}` by the rhachet practice) vs drop them.
- taken: pin latest (0.1.4, 0.1.0, 0.4.0) and add them to `.depcheckrc.yml` ignores, beside their peers. also ignore `.claude` (now a symlink into `.agent/.actors`).
- rework: clean — package.json + depcheckrc lines.
- confidence: 90%. the practice declares them; a pin honors that intent.
