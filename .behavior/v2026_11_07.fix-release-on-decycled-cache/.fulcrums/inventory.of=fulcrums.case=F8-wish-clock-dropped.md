# F8 — the committed wish drops its clock

- fork: (a) drop the `[clock]` (hour + minute + zone) from line 5 of the committed `0.wish.md`; (b) commit with `--no-verify`; (c) leave `.behavior/` out of the pr.
- taken: (a). `.husky/check.timestamps.sh` refuses any raw clock in a tracked non-code file, with zero exemptions by design; (b) would also skip the secret scan; (c) drops the route record. the date stays; the verbatim wish stays at `~/.rhx/wish/sdk-config.beav.fix-release-on-decycled-cache.wish.md`.
- rework: clean — one line.
- confidence: 85%. it edits the wisher's archived words; the clock carries no decision.
