#!/usr/bin/env node
/**
 * One-command runner: auto-installs frontend dependencies on first use,
 * then executes the requested command (dev / build / preview).
 * Cross-platform (Windows / macOS / Linux), no shell features required.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const command = process.argv[2] ?? 'dev'
const feDir = join(process.cwd(), 'frontend')
const viteBin = join(feDir, 'node_modules', '.bin', 'vite')

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, cwd: process.cwd() })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))))
    child.on('error', reject)
  })
}

try {
  if (!existsSync(viteBin)) {
    console.log('\nПервый запуск: устанавливаю зависимости (нужен интернет, ~1–2 минуты)…')
    console.log('First run: installing dependencies (internet required, ~1–2 min)…\n')
    await run('pnpm', ['--dir', 'frontend', 'install'])
  }
  await run('pnpm', ['--dir', 'frontend', command])
} catch (err) {
  console.error(String(err.message ?? err))
  process.exit(1)
}
