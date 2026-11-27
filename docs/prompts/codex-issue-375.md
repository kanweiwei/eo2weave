# Codex prompt — implement issue #375 (remove the formatSize alias)

Copy everything below the line into Codex. It is self-contained.

---

You are working in the repository at the current working directory: EO2Weave
(React 18 + TypeScript strict). The current branch should be `main`; create a new
branch `refactor/375-remove-format-size-alias` before making any changes.

## Task

Implement GitHub issue #375: remove the `formatSize` compatibility alias from
`web/lib/utils.ts` and migrate every import site to `formatBytes` directly.
~31 files import one or the other today.

## Steps

1. `git grep -rn "formatSize" web/ --include='*.ts' --include='*.tsx' | grep -v test`
   — enumerate all import sites and usages. Also check `formatSize` usages inside
   test files (update them to `formatBytes` too).
2. Replace every import and usage of `formatSize` with `formatBytes` (pure rename —
   identical signature and behavior, `formatSize` just calls `formatBytes`).
3. Delete the `formatSize` export from `web/lib/utils.ts`.
4. Check for any string references (`'formatSize'` as a literal, mock objects) via
   `git grep -n "formatSize" web/` and clean those too.

## Required verification (all must pass before you finish)

```bash
pnpm -C web run typecheck
pnpm -C web run test -- --run lib
pnpm -C web run lint
grep -rn "formatSize" web/ | grep -v node_modules | wc -l   # expect 0
```

## Deliverable

- One commit on `refactor/375-remove-format-size-alias`, message:
  `refactor(web): remove the formatSize alias (#375)`
- Report: number of files touched, verification output.

## Do NOT

- Do not push, do not open a PR — I will review and push manually.
- Do not rename `formatBytes` (it is the canonical name).
- Do not touch `formatSize` functions in OTHER files that are unrelated duplicates —
  only the alias in `web/lib/utils.ts` and its import sites.

## Note on sequencing

If issue #373 (unit tests for formatBytes) has already been implemented and merged,
keep those tests passing (rename `formatSize` references inside them). If #373 is
NOT yet done, do this refactor anyway — tests come separately.
