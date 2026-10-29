/**
 * User Skills Scanner — scans OPFS `.skills/user/` directory for user skills.
 *
 * User skills are stored as SKILL.md files (same format as project skills)
 * under `.skills/user/<skill-name>/SKILL.md` in OPFS. This module reads them
 * at runtime and returns Skill objects with `source: 'user'`.
 *
 * Unlike persistent SQLite skills, these are NOT stored in the database —
 * the OPFS files are the single source of truth. The SkillManager loads
 * them into its runtime cache on initialization.
 */

import type { Skill, SkillResource } from './skill-types'
import { parseSkillMd, slugify } from './skill-parser'
import { copyDirectoryRecursive } from './skill-folder-utils'
import { Unzip, UnzipInflate } from 'fflate'
import {
  getResourceType,
  getMimeType,
  generateResourceId,
  isTextFile,
} from './skill-resources'
import { RESOURCE_LIMITS } from './skill-types'

/** OPFS root directory name for all skills */
const SKILLS_ROOT = '.skills'
/** Subdirectory under SKILLS_ROOT for user skills */
const USER_SKILLS_DIR = 'user'
/**
 * Subdirectory under SKILLS_ROOT for durable import backups. Before an
 * import removes an existing skill directory, the previous content is
 * staged here (one unique run folder per import) so a tab close between
 * removal and rollback cannot lose the skill. Cleaned up when the import
 * finishes; a crashed import leaves the backup behind as recovery data.
 */
const IMPORT_BACKUPS_DIR = '.import-backups'

/** True when the error is an OPFS "not found" (absence — not a failure). */
function isNotFoundError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'NotFoundError') return true
  // Test doubles and polyfills may not produce real DOMExceptions.
  return e instanceof Error && e.message.includes('NotFoundError')
}

/** Concatenate streamed decoder chunks into a single buffer. */
function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0]
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const merged = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    merged.set(c, off)
    off += c.length
  }
  return merged
}

/** Scan result */
export interface UserSkillScanResult {
  skills: Skill[]
  resources: SkillResource[]
  errors: string[]
}

/**
 * Hard caps enforced DURING zip extraction (before/during unzip), so a
 * decompression-bomb archive cannot exhaust browser memory: every entry is
 * rejected and its data discarded as soon as any cap is exceeded.
 */
export const ZIP_IMPORT_LIMITS = {
  /** Max compressed size of a single zip entry (bytes). */
  MAX_ENTRY_COMPRESSED_SIZE: 10 * 1024 * 1024,
  /** Max expanded size of a single zip entry (bytes). */
  MAX_ENTRY_SIZE: 10 * 1024 * 1024,
  /** Max total expanded size across the whole archive (bytes). */
  MAX_TOTAL_SIZE: 64 * 1024 * 1024,
  /** Max number of file entries in the archive. */
  MAX_ENTRIES: 2000,
} as const

/**
 * Extract zip entries incrementally with hard size caps (memory-bomb guard).
 *
 * Unlike `unzipSync` — which buffers the entire archive before any limit
 * can be checked — this streams each entry through fflate's `Unzip` and
 * discards data as soon as a cap trips, then aborts the extraction.
 *
 * @returns the accepted entries (path → data), or throws when a cap is hit.
 */
async function unzipWithLimits(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  const limits = ZIP_IMPORT_LIMITS
  const files: Record<string, Uint8Array> = {}
  let entryCount = 0
  let totalSize = 0
  let failure: Error | null = null

  const unzipper = new Unzip()
  unzipper.register(UnzipInflate)
  unzipper.onfile = (file) => {
    // Directory entries carry no data.
    if (file.name.endsWith('/')) {
      file.ondata = () => {}
      file.start()
      return
    }
    entryCount++
    if (entryCount > limits.MAX_ENTRIES) {
      failure = new Error(
        `ZIP archive has too many entries (limit: ${limits.MAX_ENTRIES}).`,
      )
      file.terminate()
      return
    }
    // Pre-check the compressed size from the central directory when present.
    if (typeof file.size === 'number' && file.size > limits.MAX_ENTRY_COMPRESSED_SIZE) {
      failure = new Error(
        `ZIP entry "${file.name}" is too large (${file.size} bytes compressed).`,
      )
      file.terminate()
      return
    }
    // Cumulative expanded size for THIS entry (the decoder may deliver a
    // large entry in several chunks — checking each chunk alone would let
    // a single oversized entry slip through chunk by chunk). Chunks are
    // buffered and concatenated once, on the entry's final chunk.
    let entrySize = 0
    let entryChunks: Uint8Array[] = []
    file.ondata = (err, data, final) => {
      if (err) {
        failure = err instanceof Error ? err : new Error(String(err))
        return
      }
      // Once failed, discard the rest instead of buffering it.
      if (failure) return
      totalSize += data.length
      entrySize += data.length
      if (
        entrySize > limits.MAX_ENTRY_SIZE ||
        totalSize > limits.MAX_TOTAL_SIZE
      ) {
        failure = new Error(
          'ZIP archive expands beyond the import size limit — it may be a decompression bomb.',
        )
        return
      }
      entryChunks.push(data)
      if (final) {
        files[file.name] = concatChunks(entryChunks)
        entryChunks = []
      }
    }
    file.start()
  }

  const CHUNK_SIZE = 65_536
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    if (failure) throw failure
    unzipper.push(data.subarray(offset, offset + CHUNK_SIZE), false)
    // Yield so the (synchronous) decoder callbacks for this chunk run and
    // any limit trip is observed before feeding more compressed data.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  unzipper.push(new Uint8Array(0), true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (failure) throw failure
  if (entryCount === 0) {
    throw new Error('ZIP archive is empty')
  }
  return files
}

/**
 * Get the user skills directory handle from OPFS root.
 * Returns null if `.skills/user/` does not exist (not an error).
 */
async function getUserSkillsDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const opfsRoot = await navigator.storage.getDirectory()
    const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: false })
    return await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: false })
  } catch {
    // .skills/user/ doesn't exist yet — no user skills
    return null
  }
}

/**
 * Scan `.skills/user/` for all SKILL.md files and their resources.
 *
 * Each subdirectory under `user/` is treated as a skill:
 *   .skills/user/<skill-name>/SKILL.md       (required)
 *   .skills/user/<skill-name>/scripts/*.py   (optional)
 *   .skills/user/<skill-name>/references/*.md (optional)
 *   .skills/user/<skill-name>/assets/*        (optional)
 *
 * @returns Parsed skills with source='user', resources, and any errors
 */
export async function scanUserSkills(): Promise<UserSkillScanResult> {
  const skills: Skill[] = []
  const resources: SkillResource[] = []
  const errors: string[] = []

  const userDir = await getUserSkillsDir()
  if (!userDir) {
    // No user skills directory yet — this is normal
    return { skills, resources, errors }
  }

  for await (const [name, entry] of userDir.entries()) {
    if (entry.kind !== 'directory') continue

    const skillDirHandle = await userDir.getDirectoryHandle(name)
    const result = await scanSingleUserSkill(skillDirHandle, name)

    if (result.skill) {
      skills.push(result.skill)
      resources.push(...result.resources)
      errors.push(...result.errors)
    } else if (result.errors.length > 0) {
      errors.push(...result.errors)
    }
  }

  if (skills.length > 0) {
    console.log(
      `[UserSkillsScanner] Found ${skills.length} user skill(s):`,
      skills.map((s) => s.name)
    )
  }

  return { skills, resources, errors }
}

/**
 * Scan a single user skill directory.
 */
async function scanSingleUserSkill(
  skillDirHandle: FileSystemDirectoryHandle,
  dirName: string
): Promise<{ skill: Skill | null; resources: SkillResource[]; errors: string[] }> {
  const resources: SkillResource[] = []
  const errors: string[] = []

  // Find SKILL.md
  let skillMdHandle: FileSystemFileHandle | null = null
  try {
    skillMdHandle = await skillDirHandle.getFileHandle('SKILL.md')
  } catch {
    // No SKILL.md in this directory — skip
    return { skill: null, resources, errors }
  }

  // Read and parse SKILL.md
  let content: string
  let fileMtime = 0
  try {
    const file = await skillMdHandle.getFile()
    content = await file.text()
    fileMtime = file.lastModified
  } catch (e) {
    errors.push(`user/${dirName}/SKILL.md: ${e instanceof Error ? e.message : String(e)}`)
    return { skill: null, resources, errors }
  }

  const result = parseSkillMd(content, 'user')
  if (!result.skill) {
    errors.push(`user/${dirName}/SKILL.md: ${result.error ?? 'parse error'}`)
    return { skill: null, resources, errors }
  }

  // Use directory name as skill ID (it's already slug-safe)
  // ParseSkillMd generates ID from name via slugify, but directory name is
  // the authoritative ID for user skills.
  const skill = result.skill
  skill.id = `user:${dirName}`
  skill.source = 'user'
  // Use the actual file modification time so multiple skills imported
  // around the same time can be distinguished by when their SKILL.md
  // was last edited.
  if (fileMtime) {
    skill.updatedAt = fileMtime
    skill.createdAt = fileMtime
  }

  // Scan resources (same logic as project skill scanner)
  await scanUserSkillResources(skillDirHandle, skill.id, resources, errors)

  return { skill, resources, errors }
}

/**
 * Scan resource files in a user skill directory.
 */
async function scanUserSkillResources(
  skillDirHandle: FileSystemDirectoryHandle,
  skillId: string,
  resources: SkillResource[],
  errors: string[]
): Promise<void> {
  let totalSize = 0
  let fileCount = 0

  const ignoredDirs = new Set([
    '.git', '.svn', '.hg', 'node_modules', '__pycache__', '.pytest_cache', '.venv', 'venv',
  ])

  const scanRecursive = async (
    dirHandle: FileSystemDirectoryHandle,
    relativeDir: string
  ): Promise<void> => {
    for await (const [name, entry] of dirHandle.entries()) {
      if (entry.kind === 'directory') {
        if (ignoredDirs.has(name)) continue
        const subDir = await dirHandle.getDirectoryHandle(name)
        const nextRelativeDir = relativeDir ? `${relativeDir}/${name}` : name
        await scanRecursive(subDir, nextRelativeDir)
        continue
      }

      // Skip SKILL.md — it's the skill instruction, not a resource
      if (name.toUpperCase() === 'SKILL.MD') continue

      const resourcePath = relativeDir ? `${relativeDir}/${name}` : name

      try {
        const file = await entry.getFile()
        const size = file.size

        if (size > RESOURCE_LIMITS.MAX_FILE_SIZE) {
          errors.push(`${skillId}/${resourcePath}: File too large (${size} bytes)`)
          continue
        }
        if (totalSize + size > RESOURCE_LIMITS.MAX_TOTAL_SIZE) {
          errors.push(`${skillId}/${resourcePath}: Total resources too large, skipping`)
          break
        }
        if (fileCount >= RESOURCE_LIMITS.MAX_RESOURCES_PER_SKILL) {
          errors.push(`${skillId}/${resourcePath}: Too many resource files, skipping`)
          break
        }

        if (!isTextFile(name)) {
          // Binary resources are available via OPFS but not loaded as text
          continue
        }

        const fileContent = await file.text()
        const contentType = getMimeType(name)
        const topLevelDir = resourcePath.split('/')[0] || ''
        const resourceType = getResourceType(topLevelDir)

        resources.push({
          id: generateResourceId(skillId, resourcePath),
          skillId,
          resourcePath,
          resourceType,
          content: fileContent,
          contentType,
          size,
          createdAt: Date.now(),
        })

        totalSize += size
        fileCount++
      } catch (e) {
        errors.push(`${skillId}/${resourcePath}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  await scanRecursive(skillDirHandle, '')
}

/**
 * Derive the OPFS directory name for a skill.
 *
 * Uses the shared `slugify` function (same logic used by `parseSkillMd` to
 * generate a skill ID from its name, and by `importSkillMd` in the store).
 * This ensures that migration, import, and manual creation all derive the
 * **same** directory name from a given skill name, preventing duplicates.
 *
 * Skill names already use `cw-` kebab-case (filesystem-safe), so in practice
 * `slugify(name)` returns the name unchanged for well-formed names.
 *
 * @param name  Skill display name (e.g. `cw-my-skill`)
 * @param id    Skill ID (used only as a fallback if name is empty)
 */
function deriveDirName(name: string, id: string): string {
  // Prefer the name — it's what import/create use to derive the dir.
  // Fall back to the ID segment after the last ':' (e.g. legacy `user:foo`).
  const candidate = name || id.split(':').pop() || ''
  return slugify(candidate)
}

/**
 * Migrate user skills from SQLite to OPFS `.skills/user/`.
 *
 * Older versions of the app stored user-created skills in the SQLite `skills`
 * table with `source = 'user'`. The current architecture uses OPFS
 * `.skills/user/<dir>/SKILL.md` as the single source of truth.
 *
 * This function:
 *   1. Queries SQLite for `source = 'user'` skills
 *   2. For each, writes SKILL.md + resources to OPFS (if not already present)
 *   3. Deletes the record from SQLite (after successful OPFS write)
 *
 * The migration is idempotent — if the OPFS directory already exists,
 * the skill is treated as already migrated and the SQLite record is pruned.
 *
 * @returns Summary of migrated/pruned skills
 */
export async function migrateUserSkillsFromSQLite(): Promise<{
  migrated: string[]
  pruned: string[]
  errors: string[]
}> {
  const migrated: string[] = []
  const pruned: string[] = []
  const errors: string[] = []

  // Import lazily to avoid circular dependencies during module init
  const { getSkillRepository } = await import('@/sqlite')
  const repo = getSkillRepository()

  let legacySkills
  try {
    legacySkills = await repo.findBySource('user')
  } catch (e) {
    // SQLite not ready or table missing — nothing to migrate
    errors.push(`findBySource failed: ${e instanceof Error ? e.message : String(e)}`)
    return { migrated, pruned, errors }
  }

  if (legacySkills.length === 0) {
    return { migrated, pruned, errors }
  }

  console.log(
    `[UserSkillsScanner] Migrating ${legacySkills.length} user skill(s) from SQLite to OPFS`
  )

  const opfsRoot = await navigator.storage.getDirectory()
  const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: true })
  const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: true })

  for (const skill of legacySkills) {
    const dirName = deriveDirName(skill.name, skill.id)
    if (!dirName) {
      errors.push(`Skill ${skill.id}: could not derive directory name`)
      continue
    }

    try {
      // Check if OPFS directory already exists (already migrated)
      let skillDir: FileSystemDirectoryHandle
      try {
        skillDir = await userDir.getDirectoryHandle(dirName)
        // Directory exists — skill was already migrated, just prune SQLite
        await repo.delete(skill.id)
        pruned.push(skill.id)
        continue
      } catch {
        // Not found — create it
        skillDir = await userDir.getDirectoryHandle(dirName, { create: true })
      }

      // Write SKILL.md (prefer rawContent, fallback to re-serialised instruction)
      const skillMdContent =
        skill.rawContent ||
        skill.instruction ||
        `# ${skill.name}\n\n${skill.description || ''}\n`
      const mdHandle = await skillDir.getFileHandle('SKILL.md', { create: true })
      const writable = await mdHandle.createWritable()
      await writable.write(skillMdContent)
      await writable.close()

      // Write resource files
      let resources: SkillResource[]
      try {
        resources = await repo.getResources(skill.id)
      } catch {
        resources = []
      }
      for (const resource of resources) {
        try {
          const parts = resource.resourcePath.split('/').filter(Boolean)
          const fileName = parts.pop()!
          let dir = skillDir
          for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: true })
          }
          const resHandle = await dir.getFileHandle(fileName, { create: true })
          const rw = await resHandle.createWritable()
          await rw.write(resource.content)
          await rw.close()
        } catch (e) {
          errors.push(
            `Skill ${skill.id} resource ${resource.resourcePath}: ${e instanceof Error ? e.message : String(e)}`
          )
        }
      }

      // Migration of this skill succeeded — delete from SQLite
      await repo.delete(skill.id)
      migrated.push(skill.id)
      console.log(`[UserSkillsScanner] Migrated user skill: ${skill.id} → .skills/user/${dirName}/`)
    } catch (e) {
      errors.push(`Skill ${skill.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(
    `[UserSkillsScanner] Migration complete: ${migrated.length} migrated, ${pruned.length} pruned, ${errors.length} errors`
  )

  return { migrated, pruned, errors }
}

/**
 * Write a user skill SKILL.md to OPFS `.skills/user/<dirName>/SKILL.md`.
 * Creates intermediate directories as needed.
 *
 * @param dirName  Skill directory name (slug-safe)
 * @param content  SKILL.md file content
 */
export async function writeUserSkillMd(dirName: string, content: string): Promise<void> {
 const opfsRoot = await navigator.storage.getDirectory()
 const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: true })
 const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: true })
 const skillDir = await userDir.getDirectoryHandle(dirName, { create: true })
 const mdHandle = await skillDir.getFileHandle('SKILL.md', { create: true })
 const writable = await mdHandle.createWritable()
 await writable.write(content)
 await writable.close()
}

/**
 * Import a skill folder from a native FileSystemDirectoryHandle into OPFS
 * `.skills/user/<dirName>/`.
 *
 * Copies the entire folder recursively (including SKILL.md and any resource
 * files). If a skill with the same directory name already exists, it is
 * replaced (old directory removed first to avoid stale file accumulation).
 *
 * @param srcDirHandle  Source folder handle (from drag-drop or folder picker)
 * @returns the number of files copied.
 */
export async function importUserSkillFolder(
  srcDirHandle: FileSystemDirectoryHandle,
): Promise<number> {
  const dirName = srcDirHandle.name
  const opfsRoot = await navigator.storage.getDirectory()
  const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: true })
  const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: true })

  // Remove existing skill directory to avoid stale files
  try {
    await userDir.removeEntry(dirName, { recursive: true })
  } catch {
    // Directory doesn't exist yet — fine
  }

  // Create fresh skill directory and copy files recursively
  const skillDir = await userDir.getDirectoryHandle(dirName, { create: true })
  return copyDirectoryRecursive(srcDirHandle, skillDir)
}

/**
 * Result of inspecting a single skill inside a zip — used for preview UI.
 */
export interface ZipSkillEntry {
  /** Skill directory name (inferred from zip filename or root folder) */
  dirName: string
  /** File tree for preview */
  entries: import('./skill-folder-utils').FileEntry[]
  /** File count for this skill */
  fileCount: number
  /** The common root prefix in the zip (e.g. "skills/my-skill/") */
  _commonRoot: string
}

/**
 * Result of inspecting a zip before import — used for preview UI.
 * Supports both single-skill and multi-skill (bundle) zips.
 */
export interface ZipSkillPreview {
  /** Whether this zip contains multiple skills (bundle mode) */
  isBundle: boolean
  /** Single skill preview (when isBundle=false) */
  skill?: ZipSkillEntry
  /** Multiple skill previews (when isBundle=true) */
  skills?: ZipSkillEntry[]
  /** The raw unzipped entries (path → data), kept for the actual write */
  _raw: Record<string, Uint8Array>
}

/** Find all SKILL.md paths in the unzipped data (case-insensitive). */
function findAllSkillMdPaths(paths: string[]): string[] {
  return paths.filter((p) => p.split('/').pop()?.toLowerCase() === 'skill.md')
}

/**
 * Build a single ZipSkillEntry from a SKILL.md path within the zip.
 * Derives dirName and collects all files under the same root.
 */
function buildSkillEntry(
  allPaths: string[],
  skillMdPath: string,
  _raw: Record<string, Uint8Array>,
  fallbackDirName: string,
): ZipSkillEntry {
  // Determine the common root prefix for this skill (everything before SKILL.md).
  const segments = skillMdPath.split('/')
  const commonRoot = segments.length > 1 ? segments.slice(0, -1).join('/') + '/' : ''

  // Infer dirName: prefer the top-level folder name, otherwise use fallback.
  let dirName: string
  if (commonRoot) {
    dirName = commonRoot.replace(/\/$/, '')
    // For bundle mode, dirName might be nested (e.g. "skills/my-skill").
    // Take only the last segment as the actual skill directory name.
    if (dirName.includes('/')) {
      dirName = dirName.split('/').pop()!
    }
  } else {
    dirName = fallbackDirName
  }

  // Collect paths that belong to this skill (under commonRoot).
  const skillPaths = commonRoot
    ? allPaths.filter((p) => p.startsWith(commonRoot))
    : allPaths

  // Strip common root for preview
  const relativePaths = skillPaths.map((p) =>
    commonRoot && p.startsWith(commonRoot) ? p.slice(commonRoot.length) : p,
  )

  return {
    dirName,
    entries: buildFileTreeFromPaths(relativePaths),
    fileCount: skillPaths.length,
    _commonRoot: commonRoot,
  }
}

/**
 * Inspect a zip file for skill import (stage 1 — validation + preview).
 *
 * Unzips in memory, finds SKILL.md file(s), and builds preview data.
 * Supports both single-skill zips and multi-skill bundle zips.
 *
 * @param zipFile  The .zip File object (from drag-drop or file picker)
 * @returns preview data, or throws if the zip is invalid.
 */
export async function previewUserSkillZip(zipFile: File): Promise<ZipSkillPreview> {
  // Size caps BEFORE any unzip work: reject oversized archives up front
  // instead of buffering them (decompression-bomb guard).
  if (zipFile.size > ZIP_IMPORT_LIMITS.MAX_TOTAL_SIZE) {
    throw new Error(
      `ZIP archive is too large (${zipFile.size} bytes; limit: ${ZIP_IMPORT_LIMITS.MAX_TOTAL_SIZE} bytes).`,
    )
  }
  const buffer = await zipFile.arrayBuffer()
  const unzipped = await unzipWithLimits(new Uint8Array(buffer))

  // Build a list of file paths (skip directory entries ending with '/')
  const allPaths = Object.keys(unzipped).filter((p) => !p.endsWith('/'))
  if (allPaths.length === 0) {
    throw new Error('ZIP archive is empty')
  }

  // Find all SKILL.md files (case-insensitive)
  const skillMdPaths = findAllSkillMdPaths(allPaths)
  if (skillMdPaths.length === 0) {
    throw new Error('No SKILL.md found in ZIP archive')
  }

  const fallbackDirName = zipFile.name.replace(/\.zip$/i, '')

  // Build skill entries for each SKILL.md found
  const skills = skillMdPaths.map((mdPath) =>
    buildSkillEntry(allPaths, mdPath, unzipped, fallbackDirName),
  )

  // Validate dirNames — they must be safe identifiers.
  for (const skill of skills) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(skill.dirName)) {
      throw new Error(
        `Invalid skill name "${skill.dirName}". Skill folder names must start with a letter and contain only letters, digits, and hyphens (e.g. "my-skill").`,
      )
    }
  }

  if (skills.length === 1) {
    return {
      isBundle: false,
      skill: skills[0],
      _raw: unzipped,
    }
  }

  return {
    isBundle: true,
    skills,
    _raw: unzipped,
  }
}

/**
 * Import a single skill from unzipped data into OPFS `.skills/user/<dirName>/`.
 *
 * @param raw       The raw unzipped entries (path → data)
 * @param dirName   Target skill directory name
 * @param commonRoot  The common root prefix to strip from each path
 * @returns the number of files written.
 */
async function writeZipSkillToOpfs(
  raw: Record<string, Uint8Array>,
  dirName: string,
  commonRoot: string,
  /** Pre-created directory handle — skips the internal removal when the caller already staged the target. */
  precreatedDir?: FileSystemDirectoryHandle,
): Promise<number> {
  let skillDir: FileSystemDirectoryHandle
  if (precreatedDir) {
    skillDir = precreatedDir
  } else {
    const opfsRoot = await navigator.storage.getDirectory()
    const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: true })
    const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: true })

    // Remove existing skill directory to avoid stale files
    try {
      await userDir.removeEntry(dirName, { recursive: true })
    } catch {
      // Directory doesn't exist yet — fine
    }
    skillDir = await userDir.getDirectoryHandle(dirName, { create: true })
  }
  let fileCount = 0

  for (const [path, data] of Object.entries(raw)) {
    if (path.endsWith('/')) continue

    // Only process files under this skill's common root
    if (commonRoot && !path.startsWith(commonRoot)) continue

    // Strip common root prefix
    const relPath = commonRoot && path.startsWith(commonRoot)
      ? path.slice(commonRoot.length)
      : path

    // Split into path segments and navigate/create intermediate dirs
    const parts = relPath.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let currentDir = skillDir
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
    }

    const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(data)
    await writable.close()
    fileCount++
  }

  return fileCount
}

/**
 * Write a flat map of relative paths → data into `dirHandle` (staging and
 * restore helper).
 */
async function writeSkillFiles(
  dirHandle: FileSystemDirectoryHandle,
  files: Record<string, Uint8Array>,
): Promise<void> {
  for (const [path, data] of Object.entries(files)) {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let currentDir = dirHandle
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
    }
    const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(data)
    await writable.close()
  }
}

/**
 * Read a staged backup directory back from OPFS (restore path for a failed
 * overwrite-import). Unlike the in-memory backup map, this survives a tab
 * close during the import window.
 */
async function readStagedBackup(
  stagedDir: FileSystemDirectoryHandle,
): Promise<Record<string, Uint8Array>> {
  const readRecursive = async (
    dirHandle: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<Record<string, Uint8Array>> => {
    const out: Record<string, Uint8Array> = {}
    for await (const [name, entry] of dirHandle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name
      if (entry.kind === 'directory') {
        const sub = await dirHandle.getDirectoryHandle(name)
        Object.assign(out, await readRecursive(sub, path))
      } else {
        const file = await (entry as FileSystemFileHandle).getFile()
        out[path] = new Uint8Array(await file.arrayBuffer())
      }
    }
    return out
  }
  return readRecursive(stagedDir, '')
}

/**
 * Import a previewed zip skill into OPFS `.skills/user/<dirName>/` (stage 2).
 *
 * For single-skill zips, imports the one skill.
 * For bundle zips, imports all skills.
 *
 * Backups are DURABLE: before any original is removed, the previous content
 * is staged on disk under `.skills/.import-backups/<runId>/<dirName>/`, so a
 * tab close between removal and rollback cannot lose the skill — the backup
 * survives in OPFS. On success the staged run directory is deleted; on
 * failure the skill is restored FROM THE STAGED DIRECTORY (not memory) and
 * the run directory is then cleaned up.
 *
 * On failure, only the directories THIS import actually touched are cleaned
 * up: directories that did not exist before the import are removed, and
 * directories that were overwritten are restored from the staged backup — a
 * previously installed skill that merely appears in a failed bundle preview
 * is never deleted.
 *
 * @param preview  The preview returned by previewUserSkillZip
 * @returns the total number of files written across all skills.
 */
export async function importUserSkillZip(
  preview: ZipSkillPreview,
): Promise<number> {
  const { _raw } = preview
  const skills = preview.isBundle ? (preview.skills ?? []) : preview.skill ? [preview.skill] : []

  if (skills.length === 0) return 0

  const opfsRoot = await navigator.storage.getDirectory()
  const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: true })
  const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: true })
  const backupsRoot = await skillsDir.getDirectoryHandle(IMPORT_BACKUPS_DIR, { create: true })
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const runDir = await backupsRoot.getDirectoryHandle(runId, { create: true })

  // Stage 1: back up every target directory that already exists — staged
  // DURABLY under .skills/.import-backups/<runId>/ — then remove it so
  // writeZipSkillToOpfs starts from a clean slate. The staged backups let
  // us restore the previous version if a later skill in the bundle fails,
  // even if this tab dies before the rollback runs.
  const backedUp = new Set<string>()
  const preRemoved = new Set<string>()
  try {
    for (const s of skills) {
      // Throws on a real read failure — absence (NotFoundError) returns
      // null and is the only "no backup needed" signal.
      const existing = await readUserSkillDir(userDir, s.dirName)
      if (existing) {
        const stagedDir = await runDir.getDirectoryHandle(s.dirName, { create: true })
        await writeSkillFiles(stagedDir, existing)
        backedUp.add(s.dirName)
        try {
          await userDir.removeEntry(s.dirName, { recursive: true })
          preRemoved.add(s.dirName)
        } catch {
          // Nothing to remove — fine.
        }
      }
    }
  } catch (e) {
    // Backup staging failed BEFORE anything was removed — abort the import
    // without touching any existing skill.
    try {
      await backupsRoot.removeEntry(runId, { recursive: true })
    } catch {
      // Cleanup best-effort.
    }
    throw e
  }

  const hasStagedBackup = async (dirName: string): Promise<boolean> => {
    if (!backedUp.has(dirName)) return false
    try {
      await runDir.getDirectoryHandle(dirName)
      return true
    } catch {
      return false
    }
  }

  // Stage 2: write each skill, tracking exactly what this import wrote.
  const written = new Set<string>()
  try {
    let total = 0
    for (const s of skills) {
      // Create the target only when we actually write the skill — an
      // untouched skill's directory must not be (re)created on failure.
      const target = preRemoved.has(s.dirName)
        ? await userDir.getDirectoryHandle(s.dirName, { create: true })
        : undefined
      total += await writeZipSkillToOpfs(_raw, s.dirName, s._commonRoot, target)
      written.add(s.dirName)
    }
    // Success: the staged backups are no longer needed. Cleanup is
    // best-effort — a leftover staging dir must never turn a successful
    // import into a rollback.
    try {
      await backupsRoot.removeEntry(runId, { recursive: true })
    } catch (cleanupErr) {
      console.warn(
        `[UserSkillsScanner] Failed to clean up import backup staging ${runId}:`,
        cleanupErr,
      )
    }
    return total
  } catch (e) {
    // Stage 3 (cleanup): restore overwritten skills from their STAGED
    // backups (disk — survives even if this tab is closing), remove
    // directories created fresh by this failed import, and recreate
    // (empty) directories we removed but never reached. Never touch
    // anything this import did not write or stage.
    const restoreFromStaging = async (dirName: string) => {
      const stagedDir = await runDir.getDirectoryHandle(dirName)
      const files = await readStagedBackup(stagedDir)
      await restoreUserSkillDir(userDir, dirName, files)
    }
    for (const dirName of written) {
      try {
        if (await hasStagedBackup(dirName)) {
          await restoreFromStaging(dirName)
        } else {
          await userDir.removeEntry(dirName, { recursive: true })
        }
      } catch (restoreErr) {
        console.warn(
          `[UserSkillsScanner] Failed to roll back ${dirName}:`,
          restoreErr,
        )
      }
    }
    for (const s of skills) {
      if (written.has(s.dirName)) continue
      try {
        if (await hasStagedBackup(s.dirName)) {
          // Staged-but-never-reached skill: its previous directory was
          // removed in stage 1 — restore it so it is exactly as before.
          await restoreFromStaging(s.dirName)
        } else {
          // Freshly created by the failed write attempt (or its
          // self-removal path) — remove the partial directory so it never
          // looks installed.
          await userDir.removeEntry(s.dirName, { recursive: true })
        }
      } catch (restoreErr) {
        console.warn(
          `[UserSkillsScanner] Failed to roll back untouched skill ${s.dirName}:`,
          restoreErr,
        )
      }
    }
    // Rollback done (best-effort) — clean up the staged run directory.
    try {
      await backupsRoot.removeEntry(runId, { recursive: true })
    } catch (cleanupErr) {
      console.warn(
        `[UserSkillsScanner] Failed to clean up import backup staging ${runId}:`,
        cleanupErr,
      )
    }
    throw e
  }
}

/**
 * Read every file under `.skills/user/<dirName>/` into memory (backup).
 *
 * Returns null ONLY when the directory does not exist (absence). Any other
 * error — a failing getFile, an unreadable entry, a partial read — throws,
 * so a caller must never interpret a real read failure as "nothing to
 * back up" and proceed without a backup (that would let a later failed
 * import delete the user's existing skill).
 */
async function readUserSkillDir(
  userDir: FileSystemDirectoryHandle,
  dirName: string,
): Promise<Record<string, Uint8Array> | null> {
  const readRecursive = async (
    dirHandle: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<Record<string, Uint8Array>> => {
    const out: Record<string, Uint8Array> = {}
    for await (const [name, entry] of dirHandle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name
      if (entry.kind === 'directory') {
        const sub = await dirHandle.getDirectoryHandle(name)
        Object.assign(out, await readRecursive(sub, path))
      } else {
        const file = await (entry as FileSystemFileHandle).getFile()
        out[path] = new Uint8Array(await file.arrayBuffer())
      }
    }
    return out
  }

  let skillDir: FileSystemDirectoryHandle
  try {
    skillDir = await userDir.getDirectoryHandle(dirName)
  } catch (e) {
    if (isNotFoundError(e)) return null
    throw e
  }
  return await readRecursive(skillDir, '')
}

/**
 * Recreate `.skills/user/<dirName>/` from a backup produced by
 * `readUserSkillDir` (restore path for a failed overwrite-import).
 */
async function restoreUserSkillDir(
  userDir: FileSystemDirectoryHandle,
  dirName: string,
  files: Record<string, Uint8Array>,
): Promise<void> {
  try {
    await userDir.removeEntry(dirName, { recursive: true })
  } catch {
    // Directory doesn't exist — fine.
  }
  const skillDir = await userDir.getDirectoryHandle(dirName, { create: true })
  for (const [path, data] of Object.entries(files)) {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let currentDir = skillDir
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
    }
    const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(data)
    await writable.close()
  }
}

/**
 * Build a FileEntry tree from a flat list of slash-separated paths.
 * Used for zip preview (zip entries are flat, not hierarchical).
 */
function buildFileTreeFromPaths(
  paths: string[],
): import('./skill-folder-utils').FileEntry[] {
  const root: import('./skill-folder-utils').FileEntry[] = []

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    let level = root

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isFile = i === parts.length - 1

      if (isFile) {
        level.push({ name, kind: 'file' })
      } else {
        let dir = level.find((e) => e.kind === 'directory' && e.name === name)
        if (!dir) {
          dir = { name, kind: 'directory', children: [] }
          level.push(dir)
        }
        level = dir.children!
      }
    }
  }

  // Sort: directories first, then files, alphabetically
  const sortEntries = (entries: import('./skill-folder-utils').FileEntry[]) => {
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    entries.forEach((e) => {
      if (e.children) sortEntries(e.children)
    })
  }
  sortEntries(root)

  return root
}

/**
 * Delete a user skill directory from OPFS `.skills/user/<dirName>/`.
 *
 * @param dirName  Skill directory name (slug-safe)
 */
export async function deleteUserSkillDir(dirName: string): Promise<void> {
 const opfsRoot = await navigator.storage.getDirectory()
 const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: false })
 const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: false })
 await userDir.removeEntry(dirName, { recursive: true })
}

/**
 * Check if a user skill directory exists in OPFS.
 * Used for validation before write operations.
 */
export async function userSkillDirExists(skillDirName: string): Promise<boolean> {
  try {
    const userDir = await getUserSkillsDir()
    if (!userDir) return false
    await userDir.getDirectoryHandle(skillDirName)
    return true
  } catch {
    return false
  }
}
