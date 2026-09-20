# Conversation Store & Workspace Runtime Split Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Split `web/store/conversation.store.sqlite.ts` (4567 lines) and `web/opfs/workspace/workspace-runtime.ts` (4195 lines) into cohesive modules WITHOUT changing any public API. Zero behavior change; full test suite stays green.

**Architecture:** Extract module-private helpers into sibling files with explicit exports, then re-export through the original module paths so all existing importers keep working unchanged. The store class and WorkspaceRuntime class stay as facades delegating to the extracted modules. Facade pattern keeps this a pure refactor — every step compiles and passes tests.

**Tech Stack:** TypeScript strict, Zustand+immer, Vitest (existing 1715-test suite is the safety net).

**Constraint from user:** DO NOT COMMIT until the whole task is done and verified.

---

## Ground Rules (every task)

1. After each task: run the relevant test chunk + `pnpm typecheck`. If anything fails, STOP and fix before proceeding.
2. Never rename or change signatures of exported symbols.
3. New files live in the same directory as their source (`web/store/` for conversation, `web/opfs/workspace/` for runtime).
4. Internal (module-private) helpers become `export`ed from their new file; the facade file imports them. This is the ONLY visibility change allowed.

---

# Part A: workspace-runtime.ts (do this FIRST — 15 test files anchor it)

The file already has section markers that define natural boundaries:

```
L252  Files Directory Operations   → workspace-files-dir.ts
L715  File Operations              → workspace-file-ops.ts
L2604 Dual Storage: Change Detection → workspace-change-detection.ts
L2838 Multi-root path resolution   → workspace-multiroot.ts
```

### Task A1: Extract multi-root path resolution

**Files:**
- Create: `web/opfs/workspace/workspace-multiroot.ts`
- Modify: `web/opfs/workspace/workspace-runtime.ts`

**Steps:**
1. Move these methods out of the WorkspaceRuntime class into a new `WorkspaceMultiRootMixin`-style helper object of pure functions taking explicit deps (the class instance fields they need: `rootMap`, `diskExec`, `projectIdCache`, `validatePath`):

   From L2838-end (~L2851 resolveProjectId, L2869 ensureRootMap, L2942 resolvePath, L3011 isReadOnlyRoot, L3019 invalidateRootCache, L2659 getNativeDirectoryHandleForPath, L2678 getAllNativeDirectoryHandles, L2698 hasAnyNativeDirectoryHandle, L2461 resolveRootIdForHandle, L2485 readNativeFileContentForPath, L2513 readNativeFileContent, L2522 writeNativeFile, L2713 listDiskDir, L2741 scanDiskTree, L2824 readFromDiskRoot, L2832 getDiskFileMetadata)

2. Because these methods touch ~6 private fields, implement as functions taking a context parameter:
   ```ts
   export interface MultiRootContext {
     runtime: WorkspaceRuntime  // typed, access to private fields via internal bridge
     ...
   }
   ```
   SIMPLER ALTERNATIVE (recommended): keep methods on the class but move the implementations to standalone exported functions in workspace-multiroot.ts, and have the class methods become one-line delegates:
   ```ts
   // workspace-runtime.ts
   async resolvePath(...) { return resolvePathImpl(this, ...) }
   ```
   The impl functions accept `this` as a first param typed via an internal interface. Export that interface from workspace-runtime.ts (or a shared `workspace-runtime-internals.ts`) to avoid circular imports: put the interface in `workspace-multiroot.ts` and have workspace-runtime.ts import the functions.

3. Run: `cd web && pnpm test:run opfs` → expect 28 files, all pass.
4. Run: `cd web && pnpm typecheck` → clean.

### Task A2: Extract Files Directory Operations

**Files:**
- Create: `web/opfs/workspace/workspace-files-dir.ts`
- Modify: `web/opfs/workspace/workspace-runtime.ts`

Move L252-714 block: `buildFilesIndex`, `scanDirRecursive`, `readFromFilesDir`, `writeToFilesDir`, `deleteFromFilesDir`, `deleteFromFilesDirIfExists`, `readFromBaselineDir`, `contentToBytes`, `areFileContentsEqual`, `writeToBaselineDir`, `deleteFromBaselineDirIfExists`, `captureModifyBaseline`, `tryLoadFromSnapshotHistory`, `restorePendingModifyFromBaseline`, `listBaselinePaths`, `cleanupStaleBaselines`, `rebuildFilesIndex`, `hasFileInIndex`, `getIndexedPaths`, `clearFilesDir`, `clearBaselineDir`, `getFilesStats`, `calculateDirStats`, `getFilesDir`, `getAssetsDir`, `getBaselineDir` → same delegate pattern as A1. These cluster around `workspaceDir` + `filesIndex` state.

Verify: `pnpm test:run opfs` + `pnpm typecheck`.

### Task A3: Extract Change Detection

**Files:**
- Create: `web/opfs/workspace/workspace-change-detection.ts`
- Modify: `web/opfs/workspace/workspace-runtime.ts`

Move `detectChanges` (L3250), `scanFilesWithCache` (L3294), `refreshPendingChanges` (L3314), `registerDetectedChanges` (L3490), plus their private helpers (`scanFiles` L3212 stays if shared — check call sites; move if only used here).

Verify: `pnpm test:run opfs` (register-detected-changes.test.ts is the anchor) + `pnpm typecheck`.

### Task A4: Extract File Operations (the big one, ~1900 lines)

**Files:**
- Create: `web/opfs/workspace/workspace-file-ops.ts`
- Modify: `web/opfs/workspace/workspace-runtime.ts`

Move `readFile` (L724), `getFileMetadata`, `readFromNativeFS`, `readCachedFile`, `readBaselineFile`, `readDiskFile`, `fileExistsOnDisk`, `writeFile` (L1045-1258), `deleteFile` (L1259), `deleteDirPending` (L1366), `materializeTextConflictMarkers` (L1753), `prepareFiles`, `copyFileWithProgress`, `writeFileToOPFS`, `hasBaselineFile`, `restorePendingModifyFromNative`.

After A4, workspace-runtime.ts should be ~1200-1500 lines: class shell + pending/sync/snapshot/discard orchestration + delegates.

Verify: `pnpm test:run opfs` (all 15 runtime test files) + `pnpm typecheck`.

### Task A5: Verify no public API changed

Run: `cd web && grep -n "export" opfs/workspace/workspace-runtime.ts | head -20` — the exported class + named exports must be unchanged.
Run: full chunk `pnpm test:run opfs` + `pnpm test:run agent components` (agent tools import the runtime).

---

# Part B: conversation.store.sqlite.ts

Structure map (verified):
- L1-800: 22 module-private functions + 3 module-level state holders (`inflightLoadFromDB`, `persistSchedulers`, `pendingConversationMetaPersists`)
- L798-935: state interface + 44 store methods
- L936-4567: method implementations (runAgent alone is ~2500 lines)

### Task B1: Extract persistence module

**Files:**
- Create: `web/store/conversation-persist.ts`
- Modify: `web/store/conversation.store.sqlite.ts`

Move (all currently module-private, verified L456-672):
- `inflightLoadFromDB` (module state — export getter/setter or move `loadFromDB` orchestration… keep as module state in new file with `withInflightLoad(fn)` wrapper)
- `pendingConversationMetaPersists`, `waitForConversationMetaPersist`
- `persistNewMessage`, `persistSchedulers`, `PERSIST_DEBOUNCE_MS`, `doPersist`, `persistMessageReplace`
- `persistConversationMeta`, `loadConversationsMeta`, `deleteConversationFromDB`

All become `export`ed. conversation.store.sqlite.ts imports them. Repos are accessed via `getConversationRepository()`/`getMessageRepository()` imports — move those imports too.

Verify: `pnpm test:run store` (conversation-persist.test.ts + conversation.store.sqlite.test.ts anchor) + typecheck.

### Task B2: Extract message-ops pure helpers

**Files:**
- Create: `web/store/conversation-message-ops.ts`
- Modify: `web/store/conversation.store.sqlite.ts`

Move: `reconcileMessageSnapshot` (already exported), `deriveContextUsageFromAssistantUsage`, `healCompressionBaseline`, `truncateTitle`, `updateAutoTitleAfterMessageDelete`, `summarizeForNotification`, `attachReasoningDurations`, `commitDraftToMessages`, `handleSubagentStepNotification`, `findSpawnStepInDraft` (already exported), `makeSyntheticAskUserResult`, `i18nText`, `ensureRuntime`.

All are pure or take explicit args (verified — none touch store state directly). Update the re-export in conversation.store.sqlite.ts: `export { findSpawnStepInDraft } from './conversation-message-ops'`.

Verify: `pnpm test:run store` + `pnpm typecheck`.

### Task B3: Slim the facade — runAgent stays

`runAgent` (~2500 lines) is the biggest single method. Per user constraint ("拆分这两个大文件") we keep it in the facade for now — moving it is a separate behavioral-risk decision. Target end state:

- `conversation.store.sqlite.ts` → ~2500 lines (store methods + runAgent), imports from B1/B2 modules
- `conversation-persist.ts` → ~350 lines
- `conversation-message-ops.ts` → ~700 lines

Verify: `pnpm test:run store` + `pnpm test:run components` (components import the store) + typecheck.

### Task B4: Full verification sweep

1. `cd web && pnpm test:run` → expect 198+ files, 0 failed
2. `cd web && pnpm typecheck` → clean
3. `cd web && pnpm exec eslint store/ opfs/workspace/` → no new errors
4. `git diff --stat` — confirm no importer files outside the two directories changed (importer count verified: 5 files import conversation.store.sqlite, 2 import workspace-runtime directly — they must be untouched)

---

## STOP conditions

- Any test that fails and cannot be fixed by fixing import paths → revert the task (`git checkout -- <file>`) and stop
- Any need to change a public signature → stop, the plan is wrong
- Circular import discovered → stop, report which symbols are entangled

## End state (when all tasks done)

Show the user: `git status` (staged but uncommitted), `git diff --stat`, test results, typecheck result. DO NOT commit — user decides.
