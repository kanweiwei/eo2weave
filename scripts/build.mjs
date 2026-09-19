#!/usr/bin/env node
// Build all project components (browser extension + web frontend).
// Run from repo root: node scripts/build.mjs
import { $, cd, chdir } from 'zx'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')

$.verbose = true

console.log('🔨 Building CreatorWeave...')
console.log('')

// Build browser extension
console.log('📦 Building browser extension...')
process.chdir(path.join(projectRoot, 'browser-extension'))
if (!fs.existsSync('node_modules')) {
  await $`pnpm install`
}
await $`pnpm run build`

// Build frontend
console.log('📦 Building frontend...')
chdir(path.join(projectRoot, 'web'))
await $`pnpm run build`

console.log('')
console.log('✅ Build completed successfully!')
console.log(`📂 Next.js build: ${path.join(projectRoot, 'web', '.next')}/`)
console.log(`🔌 Extension: ${path.join(projectRoot, 'browser-extension', 'dist')}/`)
console.log('')
console.log('To preview the build:')
console.log('  cd web && pnpm run preview')
