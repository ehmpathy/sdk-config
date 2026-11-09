# F6 — boot-generated artifacts ride along unedited

- fork: (a) ship `.husky/check.secrets.sh`, `check.timestamps.sh`, `check.timestamps.lock.sh` (husky practice, `npx declapract apply --practice husky`) and `.claude/{AGENTS,CLAUDE}.md` (rhachet actor wiring) as generated, and reseed their defects upstream; (b) patch them here; (c) drop them from this pr.
- taken: (a). `check.timestamps.lock.sh:12-13` forbids a hand edit ("the only sanctioned change to the timestamp hook is a practice upgrade"); a local patch to the secrets hook drifts from the practice and is overwritten on the next apply. (c) leaves the boot the director asked for half-done.
- the findings are real and go upstream verbatim: secret + timestamp scans fail OPEN on a grep error (exit 2 swallowed by `| head | cut`); `-I` skips binary-classified blobs unscanned; the lock reports an unreadable hook as a user change (exit 2, wrong fix); the lock omits `set -eu`; positional `timestamps_lock_halt "$1" "$2"`; no tests or snapshots for the halts. `CLAUDE.md` / `AGENTS.md` are tool-mandated names.
- rework: clean — the files are self-contained; the dream holds the fix shape.
- confidence: 80%. the fail-open scan is a security defect; the pr body names it so the commander sees it.
- dream: `.dream/v2026_11_08.reseed.husky-practice-hooks-fail-open.md`
