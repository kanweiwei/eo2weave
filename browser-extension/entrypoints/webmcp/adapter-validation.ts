import { readPackage } from '@creatorweave/shared/webmcp-adapter-files'
import type { WebMCPMount } from '@creatorweave/shared/webmcp-package-catalog'

/** Validation reads extension-owned mounts, never arbitrary page/workspace files. */
export async function validateAdapterDirectory(directory: unknown, mounts: WebMCPMount[]) {
  if (typeof directory !== 'string') throw new Error('Missing adapter package directory')
  const match = /^\/external\/(webmcp|builtin-webmcp)\/([^/]+)\/*$/.exec(directory)
  if (!match || match[2] === '.' || match[2] === '..')
    throw new Error('Expected /external/{webmcp|builtin-webmcp}/<package-id>')
  const mount = mounts.find(item => item.name === match[1])
  if (!mount) throw new Error('Adapter mount unavailable')
  const pkg = await readPackage(mount.files, match[2])
  return { id: pkg.manifest.id, version: pkg.manifest.version, tools: pkg.manifest.tools.length }
}
