import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(extensionRoot, '..', '..')
const distDir = join(extensionRoot, 'dist')
const publicDir = join(extensionRoot, 'public')
const tscBinary = join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')

if (!existsSync(tscBinary)) {
  throw new Error('TypeScript compiler not found. Run npm install in the Media Dock repo first.')
}

rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

execFileSync(tscBinary, ['-p', join(extensionRoot, 'tsconfig.json')], { stdio: 'inherit' })

cpSync(publicDir, distDir, { recursive: true })
copyFileSync(join(extensionRoot, 'README.md'), join(distDir, 'README.md'))
copyFileSync(join(extensionRoot, 'PRIVACY.md'), join(distDir, 'PRIVACY.md'))

console.log(`Built Chrome extension: ${distDir}`)
