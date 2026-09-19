#!/usr/bin/env node
// Development setup script.
// Sets up the development environment for the first time.
// Run from repo root: node scripts/setup.mjs
import { $, cd } from 'zx'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')

$.verbose = true

console.log('🚀 CreatorWeave - Development Setup')
console.log('')
console.log('This script will set up your development environment.')
console.log('')

// Check Node.js installation
console.log('📦 Checking Node.js installation...')
try {
  const version = (await $`node --version`).stdout.trim()
  console.log(`✅ Node.js ${version}`)
} catch {
  console.error('❌ Node.js is not installed.')
  console.error('   Please install Node.js from: https://nodejs.org/')
  process.exit(1)
}

// Install pnpm dependencies
console.log('📦 Installing pnpm dependencies...')
cd(path.join(projectRoot, 'web'))
if (!fs.existsSync('node_modules')) {
  await $`pnpm install`
  console.log('✅ pnpm dependencies installed')
} else {
  console.log('✅ pnpm dependencies already installed')
}

// Install pre-commit hooks
console.log('')
console.log('🪝 Setting up pre-commit hooks...')
const setupHooksScript = path.join(scriptDirectory, 'setup-hooks.mjs')
if (fs.existsSync(setupHooksScript)) {
  await $`node ${setupHooksScript}`
} else {
  console.log('⚠️  Pre-commit hooks setup script not found')
}

console.log('')
console.log('🎉 Setup completed successfully!')
console.log('')
console.log('📋 Next steps:')
console.log("  1. Run 'make dev' to start the development server")
console.log("  2. Or run 'node scripts/dev.mjs'")
console.log('')
console.log('🔖 Available commands:')
console.log('  make dev              - Start development server')
console.log('  make build            - Build all projects')
console.log('  make test             - Run all tests')
console.log('  make lint             - Run all linters')
console.log('  make format            - Format all code')
console.log('  make typecheck         - Run TypeScript type check')
console.log('')
console.log('📚 For more information, see: docs/en/developer/setup.md')
