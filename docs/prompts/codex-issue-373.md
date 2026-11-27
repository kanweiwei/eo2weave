# Codex prompt — implement issue #373 (unit tests for formatBytes/formatSize)

Copy everything below the line into Codex. It is self-contained.

---

You are working in the repository at the current working directory: EO2Weave
(React 18 + TypeScript strict + vitest). The current branch should be `main`;
create a new branch `test/373-format-bytes-unit-tests` before making any changes.

## Task

Implement GitHub issue #373: add unit tests for `formatBytes` and its alias
`formatSize` in `web/lib/utils.ts`. **Tests only — do not modify the implementation.**

## Step 1 — read the implementation first

Open `web/lib/utils.ts`, read `formatBytes` and `formatSize` carefully. Your tests
must pin the CURRENT behavior, including quirks (e.g. rounding digits, unit jump
thresholds, handling of 0 / negative / very large inputs). If a case is ambiguous
(e.g. negative input), decide what the code actually does and assert that.

## Step 2 — write the test file

Create `web/lib/__tests__/utils.format-bytes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatBytes, formatSize } from '../utils'

describe('formatBytes', () => {
  it('formats 0 as "0 B"')            // adjust to actual output
  it('stays in bytes below 1024')
  it('formats exact unit boundaries')  // 1024, 1024**2, 1024**3
  it('uses one decimal in mid ranges') // e.g. 1536 -> "1.5 KB"
  it('handles negative input')         // pin actual behavior
  it('handles very large input')       // e.g. 1024**5
})

describe('formatSize', () => {
  it('delegates to formatBytes', () => {
    for (const v of [0, 512, 1024, 1536, 1024 ** 3]) {
      expect(formatSize(v)).toBe(formatBytes(v))
    }
  })
})
```

Fill in real expected strings by calling the function (run once and print outputs),
then freeze them as assertions. Do not guess formatting.

## Required verification (all must pass before you finish)

```bash
pnpm -C web run typecheck
pnpm -C web run test -- --run lib
```

## Deliverable

- One commit on `test/373-format-bytes-unit-tests`, message:
  `test(web): cover formatBytes/formatSize with unit tests (#373)`
- Report: number of test cases, verification output.

## Do NOT

- Do not modify `web/lib/utils.ts` or any other implementation file.
- Do not push, do not open a PR — I will review and push manually.
- Do not add snapshot tests; explicit assertions only.
