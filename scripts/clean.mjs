#!/usr/bin/env node
// Clean build artifacts.
// Run from repo root: node scripts/clean.mjs
import { $ } from 'zx'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')

$.verbose = true

console.log('🧹 Cleaning build artifacts...')
console.log('')

// Clean frontend
console.log('⚛️  Cleaning frontend artifacts...')
await $`rm -rf ${path.join(projectRoot, 'web', 'dist')} ${path.join(projectRoot, 'web', 'node_modules/.vite')}`

// Clean browser extension
console.log('🔌 Cleaning browser extension artifacts...')
await $`rm -rf ${path.join(projectRoot, 'browser-extension', 'dist')} ${path.join(projectRoot, 'browser-extension', '.wxt')}`

console.log('✅ Clean completed!')
