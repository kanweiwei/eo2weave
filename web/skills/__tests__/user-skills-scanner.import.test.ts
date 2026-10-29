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

import { importUserSkillZip, previewUserSkillZip, ZIP_IMPORT_LIMITS } from '../user-skills-scanner'
import { installSkillFromUrl } from '../skill-store'

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
 * failure on one specific skill.
 */
function makeOpfsRoot(failWritesFor?: string): FileSystemDirectoryHandle {
  const fileHandle = (path: string, name: string, opts?: { create?: boolean }) => {
    const dir = dirOf(userRoot, path, opts?.create ?? false)
    if (!dir || !dir.files.has(name)) {
      if (!opts?.create) throw new Error(`NotFoundError: ${path}/${name}`)
      if (dir) dir.files.set(name, { data: new Uint8Array(0) })
    }
    const file = dir!.files.get(name)!
    return {
      kind: 'file',
      name,
      getFile: async () => ({
        arrayBuffer: async () =>
          file.data.buffer.slice(
            file.data.byteOffset,
            file.data.byteOffset + file.data.byteLength,
          ) as ArrayBuffer,
        text: async () => new TextDecoder().decode(file.data),
      }),
      createWritable: async () => {
        const chunks: Uint8Array[] = []
        return {
          write: async (d: Uint8Array) => {
            chunks.push(d)
          },
          close: async () => {
            if (failWritesFor && `${path}/${name}`.includes(failWritesFor)) {
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
