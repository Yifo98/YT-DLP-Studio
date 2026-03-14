import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const devServerUrl = 'http://127.0.0.1:5173/'

async function waitForRenderer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(devServerUrl, { method: 'GET' })
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling until Vite is really reachable.
    }
    await delay(500)
  }

  throw new Error(`Renderer did not become reachable: ${devServerUrl}`)
}

async function resolveElectronCommand() {
  const localBin = process.platform === 'win32'
    ? join(process.cwd(), 'node_modules', '.bin', 'electron.cmd')
    : join(process.cwd(), 'node_modules', '.bin', 'electron')

  await access(localBin, constants.F_OK)
  return localBin
}

await waitForRenderer()

const electronCommand = await resolveElectronCommand()
const child = spawn(electronCommand, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
