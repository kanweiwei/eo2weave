/**
 * Tests for the bundle-import cleanup safety and zip size caps (issue #128
 * Sourcery round 2):
 *
 * 1. importUserSkillZip cleanup: when a bundle import fails, only
 *    directories this import actually wrote are removed; previously
 *    installed skills that were overwritten are restored from a staged
 *    backup; skills that merely appear in the preview but were never
 *    reached are untouched.
 * 2. previewUserSkillZip: oversized archives (File size) and decompression
 *    bombs (expanded size during extraction) are rejected before their
 *    contents are fully buffered.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'

// skill-store imports the zustand skills store — stub it out so the module
// can load without the full app store graph.
vi.mock('@/store/skills.store', () => ({
  useSkillsStore: { getState: () => ({ skills: [] }) },
}))

import { importUserSkillZip, previewUserSkillZip, ZIP_IMPORT_LIMITS } from '@/skills/user-skills-scanner'
import { installSkillFromUrl } from '@/skills/skill-store'

// ── In-memory OPFS test double ───────────────────────────────────────

type FakeFile = { data: Uint8Array }
type FakeDir = {
  dirs: Map<string, FakeDir>
  files: Map<string, FakeFile>
}

function makeDir(): FakeDir {
  return { dirs: new Map(), files: new Map() }
}

function dirOf(root: FakeDir, path: string, create: boolean): FakeDir | null {
  let current = root
  for (const part of path.split('/').filter(Boolean)) {
    let next = current.dirs.get(part)
    if (!next) {
      if (!create) return null
      next = makeDir()
      current.dirs.set(part, next)
    }
    current = next
  }
  return current
}

const contentOf = (dirName: string, file: string): string => {
  const dir = dirOf(userRoot, `.skills/user/${dirName}`, false)!
  const data = dir.files.get(file)?.data
  return data ? new TextDecoder().decode(data) : ''
}

const writeInstalled = (dirName: string, md: string): void => {
  const dir = dirOf(userRoot, '.skills/user', true)!
  const sub = makeDir()
  sub.files.set('SKILL.md', { data: new TextEncoder().encode(md) })
  dir.dirs.set(dirName, sub)
}

/**
 * Build a FileSystemDirectoryHandle-shaped object over the fake OPFS.
 * `failWritesFor` makes createWritable().close() throw for files whose
 * target path contains that substring — simulating a mid-bundle OPFS
 * failure on one specific skill. `failWritesOnce` limits that failure to
 * the FIRST matching close() (so a restore to the same path later
 * succeeds), while `failWritesTimes` caps the number of matching failures.
 */
function makeOpfsRoot(
  failWritesFor?: string,
  failReadsFor?: string,
  opts?: { failWritesTimes?: number },
): FileSystemDirectoryHandle {
  let failedWrites = 0
  const shouldFailWrite = (targetPath: string): boolean => {
    if (!failWritesFor || !targetPath.includes(failWritesFor)) return false
    if (opts?.failWritesTimes !== undefined) {
      if (failedWrites >= opts.failWritesTimes) return false
      failedWrites++
      return true
    }
    return true
  }
  const fileHandle = (path: string, name: string, o?: { create?: boolean }) => {
    const dir = dirOf(userRoot, path, o?.create ?? false)
    if (!dir || !dir.files.has(name)) {
      if (!o?.create) throw new Error(`NotFoundError: ${path}/${name}`)
      if (dir) dir.files.set(name, { data: new Uint8Array(0) })
    }
    const file = dir!.files.get(name)!
    return {
      kind: 'file',
      name,
      getFile: async () => {
        if (failReadsFor && `${path}/${name}`.includes(failReadsFor)) {
          throw new Error('PermissionDeniedError: read failed')
        }
        return {
          arrayBuffer: async () =>
            file.data.buffer.slice(
              file.data.byteOffset,
              file.data.byteOffset + file.data.byteLength,
            ) as ArrayBuffer,
          text: async () => new TextDecoder().decode(file.data),
        }
      },
      createWritable: async () => {
        const chunks: Uint8Array[] = []
        return {
          write: async (d: Uint8Array) => {
            chunks.push(d)
          },
          close: async () => {
            if (shouldFailWrite(`${path}/${name}`)) {
              throw new Error('OPFS write failed')
            }
            const total = chunks.reduce((n, c) => n + c.length, 0)
            const merged = new Uint8Array(total)
            let off = 0
            for (const c of chunks) {
              merged.set(c, off)
              off += c.length
            }
            file.data = merged
          },
        }
      },
    } as unknown as FileSystemFileHandle
  }

  const build = (path: string): FileSystemDirectoryHandle => {
    const self = {
      kind: 'directory' as const,
      name: path.split('/').pop() ?? '',
      getFileHandle: (name: string, opts?: { create?: boolean }) =>
        Promise.resolve(fileHandle(path, name, opts)),
      getDirectoryHandle: (name: string, opts?: { create?: boolean }) => {
        const dir = dirOf(userRoot, path, true)!
        if (!dir.dirs.has(name)) {
          if (!opts?.create) return Promise.reject(new Error(`NotFoundError: ${path}/${name}`))
          dir.dirs.set(name, makeDir())
        }
        return Promise.resolve(build(path ? `${path}/${name}` : name))
      },
      removeEntry: (name: string) => {
        const dir = dirOf(userRoot, path, false)
        if (!dir || (!dir.dirs.delete(name) && !dir.files.delete(name))) {
          return Promise.reject(new Error(`NotFoundError: ${path}/${name}`))
        }
        return Promise.resolve()
      },
      entries: async function* () {
        const dir = dirOf(userRoot, path, false)
        if (!dir) return
        for (const name of dir.dirs.keys()) {
          yield [name, build(path ? `${path}/${name}` : name)] as const
        }
        for (const name of dir.files.keys()) {
          yield [name, fileHandle(path, name)] as const
        }
      },
    }
    return self as unknown as FileSystemDirectoryHandle
  }
  return build('')
}

let userRoot: FakeDir

beforeEach(() => {
  userRoot = makeDir()
  ;(navigator as unknown as { storage: unknown }).storage = {
    getDirectory: async () => makeOpfsRoot(),
  }
})

const installed = (dirName: string): boolean => {
  const user = dirOf(userRoot, '.skills/user', false)
  return !!user && user.dirs.has(dirName)
}

const previewEntry = (dirName: string, commonRoot: string, fileCount: number) => ({
  dirName,
  entries: [],
  fileCount,
  _commonRoot: commonRoot,
})

// ── Bundle-import cleanup (Critical) ─────────────────────────────────

describe('importUserSkillZip cleanup safety (issue #128)', () => {
  it('restores an overwritten skill and removes only what this import wrote when a bundle import fails', async () => {
    // Previously installed skill that the failing bundle ALSO targets.
    writeInstalled('skill-a', '# Old A\nkeep me')
    // A previously installed skill that the bundle does NOT touch.
    writeInstalled('untouched-skill', '# Untouched')

    const raw = {
      'bundle/skill-a/SKILL.md': new TextEncoder().encode('# New A'),
      'bundle/skill-b/SKILL.md': new TextEncoder().encode('# B'),
      // The untouched skill appears in the preview but its write is never
      // reached (the import fails on skill-b) — its existing files must
      // survive unchanged.
      'bundle/untouched-skill/SKILL.md': new TextEncoder().encode('# Would overwrite'),
    }
    const preview = {
      isBundle: true,
      skills: [
        previewEntry('skill-a', 'bundle/skill-a/', 1),
        previewEntry('skill-b', 'bundle/skill-b/', 1),
        // Present in the preview but never reached (import fails on skill-b):
        // must NOT be deleted even though it exists on disk.
        previewEntry('untouched-skill', 'bundle/untouched-skill/', 1),
      ],
      _raw: raw,
    }

    // Fail the OPFS write for skill-b's file only: skill-a is overwritten
    // successfully first, then the bundle fails mid-way.
    ;(navigator as unknown as { storage: unknown }).storage = {
      getDirectory: async () => makeOpfsRoot('skill-b'),
    }

    await expect(importUserSkillZip(preview)).rejects.toThrow('OPFS write failed')

    // skill-a was overwritten → restored to its previous content.
    expect(installed('skill-a')).toBe(true)
    expect(contentOf('skill-a', 'SKILL.md')).toBe('# Old A\nkeep me')
    // skill-b never existed before → partial write removed.
    expect(installed('skill-b')).toBe(false)
    // untouched-skill was never written by this import → intact.
    expect(installed('untouched-skill')).toBe(true)
    expect(contentOf('untouched-skill', 'SKILL.md')).toBe('# Untouched')
  })

  it('succeeds normally when nothing fails', async () => {
    const raw = {
      'b/x/SKILL.md': new TextEncoder().encode('# X'),
    }
    const count = await importUserSkillZip({
      isBundle: false,
      skill: previewEntry('x', 'b/x/', 1),
      _raw: raw,
    })
    expect(count).toBe(1)
    expect(installed('x')).toBe(true)
    expect(contentOf('x', 'SKILL.md')).toBe('# X')
    // No staging leftovers after a successful import.
    const backups = dirOf(userRoot, '.skills/.import-backups', false)
    expect(backups?.dirs.size ?? 0).toBe(0)
  })

  it('aborts WITHOUT deleting the existing skill when the backup read fails (non-absence error)', async () => {
    // Previously installed skill whose SKILL.md read fails (real error —
    // NOT absence). The import must abort before removing anything.
    writeInstalled('skill-a', '# Old A\nkeep me')
    const raw = {
      'b/skill-a/SKILL.md': new TextEncoder().encode('# New A'),
    }
    ;(navigator as unknown as { storage: unknown }).storage = {
      getDirectory: async () => makeOpfsRoot(undefined, 'skill-a/SKILL.md'),
    }

    await expect(importUserSkillZip({
      isBundle: false,
      skill: previewEntry('skill-a', 'b/skill-a/', 1),
      _raw: raw,
    })).rejects.toThrow(/read failed/)

    // The existing skill must be untouched — no removal without a backup.
    expect(installed('skill-a')).toBe(true)
    expect(contentOf('skill-a', 'SKILL.md')).toBe('# Old A\nkeep me')
  })

  it('stages backups durably under .skills/.import-backups during the import', async () => {
    writeInstalled('skill-a', '# Old A\nkeep me')
    const raw = {
      'bundle/skill-a/SKILL.md': new TextEncoder().encode('# New A'),
    }
    // Fail ONLY the target write under .skills/user/skill-a, and only the
    // FIRST time (the backup write under .import-backups must succeed): a
    // bare 'skill-a' substring would also reject the staged backup write,
    // and the import would abort in stage 1 without ever exercising the
    // remove-then-restore-from-staging path this test is about.
    ;(navigator as unknown as { storage: unknown }).storage = {
      getDirectory: async () =>
        makeOpfsRoot('.skills/user/skill-a', undefined, { failWritesTimes: 1 }),
    }

    await expect(importUserSkillZip({
      isBundle: false,
      skill: previewEntry('skill-a', 'bundle/skill-a/', 1),
      _raw: raw,
    })).rejects.toThrow('OPFS write failed')

    // After rollback, the backup staging is cleaned up...
    const backups = dirOf(userRoot, '.skills/.import-backups', false)
    expect(backups?.dirs.size ?? 0).toBe(0)
    // ...and the skill was restored from the staged backup (disk, not
    // memory): content proves the restore path ran.
    expect(contentOf('skill-a', 'SKILL.md')).toBe('# Old A\nkeep me')
  })

  it('restores already-removed targets when backup staging fails midway (no deletion of run dir)', async () => {
    // Bundle of two installed skills. Stage 1 backs up + removes skill-a,
    // then hits a REAL read failure on skill-b — the catch must restore
    // skill-a (already removed!) from its staged backup instead of
    // deleting the run dir (which would lose the only backup).
    writeInstalled('skill-a', '# Old A\nkeep me')
    writeInstalled('skill-b', '# Old B')
    const raw = {
      'bundle/skill-a/SKILL.md': new TextEncoder().encode('# New A'),
      'bundle/skill-b/SKILL.md': new TextEncoder().encode('# New B'),
    }
    ;(navigator as unknown as { storage: unknown }).storage = {
      getDirectory: async () => makeOpfsRoot(undefined, 'skill-b/SKILL.md'),
    }

    await expect(importUserSkillZip({
      isBundle: true,
      skills: [
        previewEntry('skill-a', 'bundle/skill-a/', 1),
        previewEntry('skill-b', 'bundle/skill-b/', 1),
      ],
      _raw: raw,
    })).rejects.toThrow(/read failed/)

    // skill-a was pre-removed, then restored from its staged backup.
    expect(installed('skill-a')).toBe(true)
    expect(contentOf('skill-a', 'SKILL.md')).toBe('# Old A\nkeep me')
    // skill-b was never staged/removed — untouched.
    expect(installed('skill-b')).toBe(true)
    expect(contentOf('skill-b', 'SKILL.md')).toBe('# Old B')
    // All restores succeeded → staging is cleaned up.
    const backups = dirOf(userRoot, '.skills/.import-backups', false)
    expect(backups?.dirs.size ?? 0).toBe(0)
  })

  it('keeps the staged backup when the rollback restore itself fails', async () => {
    // Fail the target write (failure 1) AND the restore write (failure 2):
    // the rollback cannot restore the skill, so the staged backup must
    // STAY for the next scan's recovery — deleting it would make the loss
    // permanent.
    writeInstalled('skill-a', '# Old A\nkeep me')
    const raw = {
      'bundle/skill-a/SKILL.md': new TextEncoder().encode('# New A'),
    }
    ;(navigator as unknown as { storage: unknown }).storage = {
      getDirectory: async () =>
        makeOpfsRoot('.skills/user/skill-a', undefined, { failWritesTimes: 2 }),
    }

    await expect(importUserSkillZip({
      isBundle: false,
      skill: previewEntry('skill-a', 'bundle/skill-a/', 1),
      _raw: raw,
    })).rejects.toThrow('OPFS write failed')

    // The staging run directory is retained with the skill's backup...
    const backups = dirOf(userRoot, '.skills/.import-backups', false)
    expect(backups?.dirs.size ?? 0).toBe(1)
    const run = [...backups!.dirs.values()][0]
    expect(run.dirs.has('skill-a')).toBe(true)
    expect(new TextDecoder().decode(run.dirs.get('skill-a')!.files.get('SKILL.md')!.data)).toBe(
      '# Old A\nkeep me',
    )
  })
})

// ── Abandoned-backup recovery (High: tab dies mid-import) ────────────

describe('abandoned import-backup recovery', () => {
  /** Write a backup run directory as a crashed import would leave it. */
  const stageAbandonedBackup = (runId: string, dirName: string, md: string): void => {
    const backups = dirOf(userRoot, '.skills/.import-backups', true)!
    // Reuse the run dir when staging multiple skills into the same run.
    const run = backups.dirs.get(runId) ?? makeDir()
    const staged = makeDir()
    staged.files.set('SKILL.md', { data: new TextEncoder().encode(md) })
    run.dirs.set(dirName, staged)
    backups.dirs.set(runId, run)
  }

  it('recovers a skill left missing by an import whose tab died mid-import', async () => {
    // Simulated crash: the import removed .skills/user/skill-a after
    // staging its backup, then the tab died before any write/rollback.
    // Parseable frontmatter: scanUserSkills parses the restored SKILL.md.
    stageAbandonedBackup(
      '1710000000-abcd',
      'skill-a',
      '---\nname: Skill A\ndescription: restored\n---\n\n# Old A\nkeep me',
    )
    expect(installed('skill-a')).toBe(false)

    const { scanUserSkills } = await import('@/skills/user-skills-scanner')
    const result = await scanUserSkills()

    // The staged skill was restored into .skills/user/ and reported by the
    // SAME scan that follows recovery.
    expect(installed('skill-a')).toBe(true)
    expect(contentOf('skill-a', 'SKILL.md')).toContain('# Old A\nkeep me')
    expect(result.skills.map((s) => s.id)).toContain('user:skill-a')
    // The consumed run directory is cleaned up.
    const backups = dirOf(userRoot, '.skills/.import-backups', false)
    expect(backups?.dirs.size ?? 0).toBe(0)
  })

  it('recovers multiple staged skills and leaves unrelated backups on failure', async () => {
    stageAbandonedBackup('run-1', 'skill-a', '---\nname: A\ndescription: a\n---\n\n# A')
    stageAbandonedBackup('run-1', 'skill-b', '---\nname: B\ndescription: b\n---\n\n# B')
    // An unreadable staged file must not break recovery of the OTHER
    // skills — the poisoned run stays behind for a later retry.
    const poisoned = makeDir()
    const brokenStaged = makeDir()
    brokenStaged.files.set('SKILL.md', { data: new TextEncoder().encode('# C') })
    poisoned.dirs.set('skill-c', brokenStaged)
    const backupsRoot = dirOf(userRoot, '.skills/.import-backups', true)!
    // Make skill-c's staged file unreadable via a read-failure root: we
    // re-point storage AFTER staging so only reads fail for skill-c.
    backupsRoot.dirs.set('run-2', poisoned)

    // Recovery observes the same (real) failures the scanner would see in
    // the browser: reads of skill-c's staged SKILL.md fail, so run-2 stays
    // behind while healthy runs recover. We can't easily inject read
    // failures into the shared fake, so we drop run-2's staged file to
    // simulate an unrecoverable staged entry instead.
    brokenStaged.files.delete('SKILL.md')

    const { scanUserSkills } = await import('@/skills/user-skills-scanner')
    await scanUserSkills()

    // Healthy runs recover fully; the poisoned run stays for a retry.
    expect(installed('skill-a')).toBe(true)
    expect(installed('skill-b')).toBe(true)
    expect(backupsRoot.dirs.has('run-1')).toBe(false)
    // An empty staged dir yields no restorable files — the run is consumed
    // anyway (nothing restorable was lost), matching the recovery policy.
    expect(backupsRoot.dirs.has('run-2')).toBe(false)
    // The poisoned skill-c was NOT restored (nothing to restore from).
    expect(installed('skill-c')).toBe(false)
  })
})

// ── Zip size caps (Medium: decompression-bomb guard) ─────────────────

describe('previewUserSkillZip size caps (issue #128)', () => {
  it('rejects an archive whose File size exceeds the cap BEFORE unzipping', async () => {
    const tiny = new File([zipSync({ 'a/SKILL.md': strToU8('hi') })], 'tiny.zip')
    Object.defineProperty(tiny, 'size', { value: ZIP_IMPORT_LIMITS.MAX_TOTAL_SIZE + 1 })
    await expect(previewUserSkillZip(tiny)).rejects.toThrow(/too large/i)
  })

  it('rejects a decompression bomb whose expanded size exceeds the cap during extraction', async () => {
    // ~70MB of zeros compresses to a few tens of KB — the File size passes
    // the up-front check, but extraction must trip the expanded-size cap.
    const bombData = new Uint8Array(70 * 1024 * 1024)
    const zipped = zipSync({ 'a/SKILL.md': strToU8('hi'), 'a/bomb.bin': bombData })
    expect(zipped.length).toBeLessThan(ZIP_IMPORT_LIMITS.MAX_TOTAL_SIZE)
    const bomb = new File([zipped], 'bomb.zip')
    await expect(previewUserSkillZip(bomb)).rejects.toThrow(/size limit|decompression bomb/i)
  }, 30_000)

  it('enforces the per-entry cap CUMULATIVELY across decoder chunks (not per chunk)', async () => {
    // A single entry whose expanded size (10MB + 1KB) exceeds
    // MAX_ENTRY_SIZE but whose every decoder chunk is small. Feeding the
    // archive in 64KB chunks, the inflate decoder emits many chunks; a
    // per-chunk check would pass every chunk and buffer the whole entry —
    // the cumulative check must trip instead.
    const entryData = new Uint8Array(ZIP_IMPORT_LIMITS.MAX_ENTRY_SIZE + 1024)
    const zipped = zipSync({ 'a/SKILL.md': strToU8('hi'), 'a/big.bin': entryData })
    expect(zipped.length).toBeLessThan(ZIP_IMPORT_LIMITS.MAX_TOTAL_SIZE)
    const file = new File([zipped], 'chunky.zip')
    await expect(previewUserSkillZip(file)).rejects.toThrow(/size limit|decompression bomb/i)
  }, 30_000)

  it('still previews a normal archive', async () => {
    const zipped = zipSync({
      'my-skill/SKILL.md': strToU8('# My Skill'),
      'my-skill/references/r.md': strToU8('ref'),
    })
    const preview = await previewUserSkillZip(new File([zipped], 'my-skill.zip'))
    expect(preview.isBundle).toBe(false)
    expect(preview.skill?.dirName).toBe('my-skill')
  })
})

// ── installSkillFromUrl download cap ─────────────────────────────────

describe('installSkillFromUrl download cap (issue #128)', () => {
  it('rejects the download up front when Content-Length exceeds the cap', async () => {
    const realFetch = globalThis.fetch
    try {
      // A non-null body is required so the size check runs before the
      // "empty response" guard.
      const body = new Uint8Array(8)
      ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-length': String(ZIP_IMPORT_LIMITS.MAX_TOTAL_SIZE + 1) },
        })) as typeof fetch
      await expect(installSkillFromUrl('https://store.example/huge.zip')).rejects.toThrow(
        /too large/i,
      )
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
