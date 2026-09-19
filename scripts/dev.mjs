#!/usr/bin/env node
// Start development servers (web + browser extension).
// Run from repo root: node scripts/dev.mjs
// Press Ctrl+C to stop all servers.
import { $ } from 'zx'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')

$.verbose = true

const blue = (s) => `\x1b[0;34m${s}\x1b[0m`
const green = (s) => `\x1b[0;32m${s}\x1b[0m`
const yellow = (s) => `\x1b[0;33m${s}\x1b[0m`

const children = []

const cleanup = () => {
  console.log(yellow('\n🛑 Stopping all servers...'))
  // Kill only the process groups we spawned (each child is spawned detached so
  // it is its own group leader — killing -pid takes down the whole subtree).
  // No pkill sweep: it would also hit unrelated pnpm dev processes on the host.
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      try {
        child.kill('SIGTERM')
      } catch {
        // already exited
      }
    }
  }
  process.exit(0)
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

// Package skills first (generates dist/skills/manifest.json for SkillDiscover)
console.log(blue('📦 Packaging skills (manifest + zip)...'))
await $`cd ${path.join(projectRoot, 'web')} && node scripts/pack-skills.mjs`

// Start web (port 5173)
console.log(blue('🌐 Starting web (http://localhost:5173)...'))
const webProc = spawn('pnpm', ['run', 'dev'], {
  cwd: path.join(projectRoot, 'web'),
  stdio: 'inherit',
  detached: true, // own process group → cleanup can kill the whole subtree
})
children.push(webProc)

// Ensure browser-extension dependencies are installed
if (!fs.existsSync(path.join(projectRoot, 'browser-extension', 'node_modules'))) {
  console.log(blue('📦 Installing browser-extension dependencies...'))
  await $`cd ${path.join(projectRoot, 'browser-extension')} && pnpm install`
}

// Start browser-extension dev server LAST so its WXT development build is the
// final writer of dist/chrome-mv3. The Next.js web runtime serves its own public
// assets and no longer depends on the former Vite extension middleware.
//
// stdin trick: WXT 0.19.29 dev server registers a readline on process.stdin
// (keyboard-shortcuts.mjs) to stay alive. In background mode stdin is closed
// by the parent shell, readline emits close, and the Node process exits — even
// though `isOngoing: true` is returned. We spawn it with a pipe as stdin that
// this parent never closes (and never writes to), so the readline stays open.
console.log(blue('🧩 Starting browser-extension (wxt dev → dist/chrome-mv3)...'))
const logStream = fs.createWriteStream('/tmp/wxt-dev.log', { flags: 'a' })
const extensionProc = spawn('pnpm', ['run', 'dev'], {
  cwd: path.join(projectRoot, 'browser-extension'),
  stdio: ['pipe', 'pipe', 'pipe'], // keep stdin open with a never-ending pipe
  detached: true, // own process group → cleanup can kill the whole subtree
})
extensionProc.stdout.pipe(logStream)
extensionProc.stderr.pipe(logStream)
children.push(extensionProc)

console.log('')
console.log(green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
console.log(green('✅ All dev servers started!'))
console.log(green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
console.log('')
console.log(`  🌐 Web:       ${blue('http://localhost:5173')}`)
console.log(`  🧩 Extension: ${blue('wxt dev → dist/chrome-mv3 (DEV)')}`)
console.log('')
console.log(yellow('Press Ctrl+C to stop all servers'))
console.log('')

// Exit when either dev server dies unexpectedly
webProc.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(yellow(`⚠️  web dev server exited with code ${code}`))
    cleanup()
  }
})
extensionProc.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(yellow(`⚠️  browser-extension dev server exited with code ${code} (see /tmp/wxt-dev.log)`))
    cleanup()
  }
})

// Keep the parent alive while both servers run
await new Promise(() => {})
