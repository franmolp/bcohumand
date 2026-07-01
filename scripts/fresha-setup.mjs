/**
 * fresha-setup.mjs
 *
 * Setup de UNA SOLA VEZ para guardar la sesión de Fresha.
 * Correr localmente (NO en CI):
 *
 *   npm run fresha:setup
 *
 * Abre un navegador real. Iniciá sesión en Fresha normalmente
 * (email, contraseña, código de verificación si lo pide).
 * El script espera a que llegues al dashboard y guarda las cookies.
 * Al final te da el valor para pegar en el secret FRESHA_SESSION de GitHub.
 */

import { chromium } from 'playwright'
import fs from 'fs'

const STATE_FILE = 'fresha-session.json'

async function main() {
  console.log('\n═══ Setup de sesión Fresha ═══\n')
  console.log('Abriendo navegador. Completá el login en Fresha (email + contraseña + código si lo pide).')
  console.log('El script espera hasta que estés en el dashboard...\n')

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  })
  const ctx = await browser.newContext({ viewport: null })
  const page = await ctx.newPage()

  await page.goto('https://partners.fresha.com/users/sign-in')

  // Esperar a que el admin complete el login y llegue a una página que no sea sign-in ni verification
  await page.waitForURL(
    url => {
      const s = url.toString()
      return !s.includes('/users/sign-in') && !s.includes('/users/verification') && !s.includes('/users/facebook-sign-in')
    },
    { timeout: 300000 } // 5 minutos para que el admin complete el login
  )

  console.log('✓ Login detectado en:', page.url())
  console.log('Guardando sesión...')

  await ctx.storageState({ path: STATE_FILE })
  await browser.close()

  const sessionJson = fs.readFileSync(STATE_FILE, 'utf8')
  const sessionB64 = Buffer.from(sessionJson).toString('base64')

  console.log('\n✓ Sesión guardada en', STATE_FILE)
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('Ahora agregá estos secrets en GitHub:')
  console.log('  Repo → Settings → Secrets and variables → Actions → New secret')
  console.log('══════════════════════════════════════════════════════════\n')
  console.log('Secret: FRESHA_SESSION')
  console.log('Valor (copiá TODO el texto de abajo, sin espacios extra):')
  console.log('─'.repeat(60))
  console.log(sessionB64)
  console.log('─'.repeat(60))
  console.log('\nTambién necesitás estos secrets si no los tenés ya:')
  console.log('  APP_URL     → URL de tu app en Vercel (ej. https://bcohumand.vercel.app)')
  console.log('  CRON_SECRET → Un string secreto largo (generá uno con: openssl rand -base64 32)')
  console.log('                Agregalo también en Vercel como variable de entorno CRON_SECRET')
  console.log('\nLa sesión dura varios meses. Si el workflow falla por sesión expirada,')
  console.log('corré este script de nuevo.\n')
}

main().catch(err => { console.error('Error:', err.message); process.exit(1) })
