#!/usr/bin/env node
/**
 * Static config checks for the Tauri desktop shell.
 * This does not boot the app, render login, or reach Supabase.
 * It only confirms the shell still wraps the existing Vite build,
 * CSP is set, and Rust has not grown data-access or authz dependencies.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function fail(message) {
  failures.push(message)
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

const pkg = JSON.parse(read('package.json'))
if (pkg.scripts?.['tauri:dev'] !== 'tauri dev') {
  fail('package.json must define "tauri:dev": "tauri dev"')
}
if (pkg.scripts?.['tauri:build'] !== 'tauri build') {
  fail('package.json must define "tauri:build": "tauri build"')
}

const cliVersion = pkg.devDependencies?.['@tauri-apps/cli'] ?? ''
if (!/^[~^]?2(\.|$)/.test(cliVersion)) {
  fail(`@tauri-apps/cli must be Tauri 2.x (got ${cliVersion || 'missing'})`)
}

const conf = JSON.parse(read('src-tauri/tauri.conf.json'))
if (conf.build?.frontendDist !== '../dist') {
  fail(`frontendDist must be "../dist" so desktop loads the same Vite output (got ${conf.build?.frontendDist})`)
}
if (conf.build?.beforeBuildCommand !== 'npm run build') {
  fail('beforeBuildCommand must be "npm run build"')
}
if (conf.build?.beforeDevCommand !== 'npm run dev') {
  fail('beforeDevCommand must be "npm run dev"')
}
if (conf.build?.devUrl !== 'http://localhost:5173') {
  fail('devUrl must be http://localhost:5173 (existing Vite port)')
}
if (conf.productName !== 'EduManage') {
  fail('productName must be EduManage')
}

const csp = conf.app?.security?.csp
if (typeof csp !== 'string' || csp.length === 0) {
  fail('app.security.csp must be a non-empty policy string (null disables CSP)')
} else {
  if (!/\bipc:/.test(csp)) fail('csp must allow Tauri IPC (ipc:)')
  if (!/\bhttps:/.test(csp)) fail('csp must allow HTTPS connect-src for env-driven Supabase')
  if (!/object-src 'none'/.test(csp)) fail("csp must set object-src 'none'")
}

const win = conf.app?.windows?.[0]
if (!win) {
  fail('tauri.conf.json must define a window')
} else {
  if (win.label !== 'main') fail('window label must be "main" (matches capabilities)')
  if ((win.width ?? 0) < 1024 || (win.height ?? 0) < 640) {
    fail('window size must be desktop-appropriate (>= 1024x640)')
  }
  if (!win.minWidth || !win.minHeight) {
    fail('window must set minWidth and minHeight')
  }
}

for (const icon of conf.bundle?.icon ?? []) {
  if (!existsSync(join(root, 'src-tauri', icon))) {
    fail(`missing icon placeholder ${icon}`)
  }
}

const cargo = read('src-tauri/Cargo.toml')
const blockedCrates = ['supabase', 'postgrest', 'sqlx', 'postgres', 'rusqlite', 'reqwest', 'hyper']
for (const crate of blockedCrates) {
  const pattern = new RegExp(`(^|\\n)${crate}\\s*=`, 'm')
  if (pattern.test(cargo)) {
    fail(`Cargo.toml must not depend on ${crate}; data access stays in the React app + Supabase`)
  }
}
if (!/tauri-build\s*=\s*\{\s*version\s*=\s*"2"/.test(cargo) || !/tauri\s*=\s*\{\s*version\s*=\s*"2"/.test(cargo)) {
  fail('Cargo.toml must pin tauri and tauri-build to major version 2')
}

const rustDir = join(root, 'src-tauri/src')
for (const name of readdirSync(rustDir)) {
  if (!name.endsWith('.rs')) continue
  const src = readFileSync(join(rustDir, name), 'utf8')
  if (/invoke_handler/.test(src) || /#\[tauri::command\]/.test(src)) {
    fail(`${name} must not register Tauri commands (no business logic in Rust)`)
  }
}

if (failures.length > 0) {
  console.error('tauri validation failed:')
  for (const message of failures) {
    console.error(` - ${message}`)
  }
  process.exit(1)
}

console.log('tauri static config validation passed')
