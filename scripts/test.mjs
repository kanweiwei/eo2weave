#!/usr/bin/env node
// Run all tests (web frontend).
// Run from repo root: node scripts/test.mjs
import { $, cd } from 'zx'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')

$.verbose = true

console.log('🧪 Running tests...')
console.log('')

console.log('⚛️  Running frontend tests...')
process.chdir(path.join(projectRoot, 'web'))
// pnpm only — the repo is a pnpm monorepo (npm test would bypass the workspace setup)
await $`pnpm test`

console.log('')
console.log('✅ All tests passed!')
