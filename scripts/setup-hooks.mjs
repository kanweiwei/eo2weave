#!/usr/bin/env node
// Setup pre-commit hooks.
// Run from repo root: node scripts/setup-hooks.mjs
import { $, cd } from 'zx'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')

$.verbose = true

console.log('🪝 Setting up pre-commit hooks...')
console.log('')

cd(path.join(projectRoot, 'web'))

// Initialize husky in the web directory (web/package.json has the `prepare: husky` script)
console.log('📦 Initializing husky...')
await $`npx husky init`

// Create pre-commit hook that runs from project root
const hookPath = path.join(projectRoot, 'web', '.husky', 'pre-commit')
const hookContent = `# Run the shared pre-commit checks from the repo root
cd "$(git rev-parse --show-toplevel)"
node scripts/pre-commit.mjs
`
fs.writeFileSync(hookPath, hookContent)
await $`chmod +x ${hookPath}`

console.log('')
console.log('✅ Pre-commit hooks installed successfully!')
console.log('')
console.log('The following hooks are now active:')
console.log('  - pre-commit: Runs TypeScript type check and ESLint')
console.log('')
console.log('To skip hooks temporarily (not recommended):')
console.log('  git commit --no-verify')
