# Codex prompt — implement issue #374 (gate console.log in useWorkspaceRouteSync)

Copy everything below the line into Codex. It is self-contained.

---

You are working in the repository at the current working directory: EO2Weave, a
browser-native AI workspace (React 18 + TypeScript strict + Vite + zustand + vitest).
The current branch should be `main`; create a new branch `fix/374-gate-route-sync-logs`
before making any changes.

## Task

Implement GitHub issue #370's sibling, issue #374: gate all `console.log` calls in
`web/hooks/useWorkspaceRouteSync.ts` behind a dev-only flag so they never execute in
a production build. There are 12 such calls in that file.

## Rules

1. **Logging only.** Do not change any logic, imports of logic, or hook behavior.
   Every `console.log` must still execute identically in dev.
2. **Keep `console.error` / `console.warn` untouched** — they indicate real problems.
3. **Use the codebase convention.** Grep `web/components/AppBootstrap.tsx` for
   `import.meta.env.DEV` and follow the same gating pattern it uses (module-level
   constant or inline check — match what the codebase already does).
4. Do not refactor anything else in the file. Minimal diff.

## Required verification (all must pass before you finish)

```bash
pnpm -C web run typecheck          # must exit 0
pnpm -C web run test -- --run src  # or the closest existing scoped test command
pnpm -C web run lint               # must not introduce new errors
```

Also verify with a production build that the logs are gone:

```bash
pnpm -C web run build
grep -c "RouteSync" web/dist/assets/*.js   # expect 0 (or only within dead code)
```

If the scoped test command doesn't exist, run the full `pnpm -C web run test -- --run`
and report the totals.

## Deliverable

- One commit on `fix/374-gate-route-sync-logs`, message:
  `chore(web): gate console.log in useWorkspaceRouteSync behind DEV (#374)`
- Report: files changed, diff size, verification output.

## Do NOT

- Do not push, do not open a PR — I will review and push manually.
- Do not touch any other file, even if you notice other ungated logs there
  (other hooks have the same problem but are separate tasks).
- Do not reformat or reorder imports.
