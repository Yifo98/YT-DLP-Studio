import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(extensionRoot, '..', '..')
const distDir = join(extensionRoot, 'dist')
const outputDir = join(repoRoot, 'release', 'extensions')
const manifest = JSON.parse(readFileSync(join(extensionRoot, 'public', 'manifest.json'), 'utf8'))
const outputPath = join(outputDir, `media-dock-cookie-exporter-${manifest.version}.zip`)

if (!existsSync(distDir)) {
  throw new Error('Extension dist directory is missing. Run the build script first.')
}

mkdirSync(outputDir, { recursive: true })
for (const fileName of readdirSync(outputDir)) {
  if (/^media-dock-cookie-exporter-.*\.zip$/i.test(fileName)) {
    rmSync(join(outputDir, fileName), { force: true })
  }
}

if (process.platform === 'win32') {
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Compress-Archive -Path "${distDir}\\*" -DestinationPath "${outputPath}" -Force`,
  ], { stdio: 'inherit' })
} else {
  execFileSync('zip', ['-qr', outputPath, '.'], { cwd: distDir, stdio: 'inherit' })
}

console.log(`Packaged Chrome extension: ${outputPath}`)
