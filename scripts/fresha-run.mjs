// Wrapper para correr fresha-scraper.mjs en Windows donde las env vars tienen limite de largo
import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const sessionPath = join(__dirname, '..', 'fresha-session.json')
const sessionB64 = Buffer.from(readFileSync(sessionPath)).toString('base64')

const env = {
  ...process.env,
  FRESHA_SESSION: sessionB64,
}

const result = spawnSync('node', [join(__dirname, 'fresha-scraper.mjs')], {
  env,
  stdio: 'inherit',
  maxBuffer: 100 * 1024 * 1024,
})

process.exit(result.status ?? 1)
