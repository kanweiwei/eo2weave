#!/usr/bin/env node
/**
 * Generate `lib/file-icons.generated.json` — the bundled subset of the
 * `vscode-icons` icon set used by `lib/file-icons.tsx`.
 *
 * The `vscode-icons` set is not published on the Iconify API, so the icons have
 * to ship with the app. This script collects every `vscode-icons:<name>`
 * reference in the web sources and extracts exactly those icons.
 *
 * Usage:
 *   node scripts/generate-file-icons.mjs                # auto-detect the icon set
 *   node scripts/generate-file-icons.mjs --source path  # use a local icons.json
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webDir = dirname(scriptDir)
const outputPath = join(webDir, 'lib', 'file-icons.generated.json')

const PREFIX = 'vscode-icons'
const PACKAGE = '@iconify-json/vscode-icons'
const SCAN_DIRS = [
  'app',
  'components',
  'lib',
  'store',
  'utils',
  'agent',
  'hooks',
  'opfs',
  'services',
  'mcp',
]
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx'])
const IGNORED_DIRS = new Set(['node_modules', '.next', 'scripts', '__tests__', 'dist', 'build'])

/** Parse `--source <path>` from argv. */
function parseArgs(argv) {
  const index = argv.indexOf('--source')
  if (index === -1) return { source: null }
  const source = argv[index + 1]
  if (!source) throw new Error('--source requires a path')
  return { source }
}

/**
 * Extract a single file from a gzipped tar archive.
 * Only the ustar header format used by npm tarballs is supported.
 */
function extractFromTarGz(buffer, wantedPath) {
  const tar = gunzipSync(buffer)
  const BLOCK = 512

  for (let offset = 0; offset + BLOCK <= tar.length; ) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const sizeField = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim()
    const size = parseInt(sizeField, 8) || 0
    const fullName = prefix ? `${prefix}/${name}` : name

    const dataStart = offset + BLOCK
    if (fullName === wantedPath) {
      return tar.subarray(dataStart, dataStart + size)
    }
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK
  }

  throw new Error(`"${wantedPath}" not found in archive`)
}

/** Download the icon set from the npm registry. */
async function downloadIconSet() {
  const registry = 'https://registry.npmjs.org'
  const metadata = await fetch(`${registry}/${encodeURIComponent(PACKAGE)}`)
  if (!metadata.ok) {
    throw new Error(`failed to query npm registry: ${metadata.status} ${metadata.statusText}`)
  }
  const { 'dist-tags': tags } = await metadata.json()
  const version = tags.latest
  const tarball = `${registry}/${PACKAGE}/-/${PACKAGE.split('/')[1]}-${version}.tgz`

  process.stderr.write(`Downloading ${PACKAGE}@${version}…\n`)
  const response = await fetch(tarball)
  if (!response.ok) {
    throw new Error(`failed to download tarball: ${response.status} ${response.statusText}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return JSON.parse(extractFromTarGz(buffer, 'package/icons.json').toString('utf8'))
}

/** Load the full icon set, preferring a local install, then the network. */
async function loadIconSet(explicitSource) {
  if (explicitSource) {
    const path = explicitSource.startsWith('/')
      ? explicitSource
      : join(process.cwd(), explicitSource)
    if (!existsSync(path)) throw new Error(`source not found: ${path}`)
    return JSON.parse(readFileSync(path, 'utf8'))
  }

  const local = join(webDir, '..', 'node_modules', PACKAGE, 'icons.json')
  if (existsSync(local)) {
    return JSON.parse(readFileSync(local, 'utf8'))
  }

  return downloadIconSet()
}

/** Recursively collect source files worth scanning. */
function collectSourceFiles(dir) {
  if (!existsSync(dir)) return []
  const files = []
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if ([...SCAN_EXTENSIONS].some((ext) => entry.endsWith(ext))) {
      files.push(full)
    }
  }
  return files
}

/** Find every `vscode-icons:<name>` reference in the web sources. */
function findReferencedIcons() {
  const names = new Set()
  const pattern = new RegExp(`${PREFIX}:([a-z0-9-]+)`, 'g')

  for (const dir of SCAN_DIRS) {
    for (const file of collectSourceFiles(join(webDir, dir))) {
      const content = readFileSync(file, 'utf8')
      for (const match of content.matchAll(pattern)) {
        names.add(match[1])
      }
    }
  }

  return names
}

/** Resolve an icon name through the alias table to its real icon. */
function resolveAlias(iconSet, name) {
  const aliases = iconSet.aliases || {}
  const seen = new Set()
  let current = name

  while (aliases[current] && !seen.has(current)) {
    seen.add(current)
    current = aliases[current].parent
  }

  return iconSet.icons[current]
}

async function main() {
  const { source } = parseArgs(process.argv.slice(2))
  const iconSet = await loadIconSet(source)

  if (iconSet.prefix !== PREFIX) {
    throw new Error(`unexpected icon set prefix "${iconSet.prefix}" (expected "${PREFIX}")`)
  }

  const referenced = [...findReferencedIcons()].sort()
  const icons = {}
  const missing = []

  for (const name of referenced) {
    const icon = resolveAlias(iconSet, name)
    if (!icon) {
      missing.push(name)
      continue
    }
    icons[name] = { body: icon.body }
  }

  if (missing.length > 0) {
    throw new Error(
      `icons not found in the "${PREFIX}" set: ${missing.join(', ')}.\n` +
        'Fix the names in lib/file-icons.tsx — a wrong name renders nothing at runtime.'
    )
  }

  const collection = {
    prefix: PREFIX,
    icons,
    width: iconSet.width,
    height: iconSet.height,
  }

  writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`)
  process.stderr.write(
    `Wrote ${Object.keys(icons).length} icons to ${relative(process.cwd(), outputPath)}\n`
  )
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
