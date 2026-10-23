// npm run dev:staging — levanta la app contra el Supabase LOCAL con las
// variables de .env.local.staging (ver scripts/README-simulacion.md).
//
// Next carga igual .env.local (producción), pero las variables que ya
// vienen definidas al arrancar tienen prioridad: por eso aquí se pasan las
// de Supabase, SESSION_SECRET y unos valores falsos de Gmail. Además
// CORREOS_DESACTIVADOS=1 hace que lib/email.ts no envíe nada.

import { spawn } from 'node:child_process'
import { leerEnvStaging } from './entornoStaging'

const vars = leerEnvStaging()
console.log(`▶ App contra Supabase local: ${vars.NEXT_PUBLIC_SUPABASE_URL} (correos desactivados)`)

const hijo = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...vars,
    GMAIL_USER: vars.GMAIL_USER || 'desactivado@staging.invalid',
    GMAIL_APP_PASSWORD: vars.GMAIL_APP_PASSWORD || 'desactivado',
  },
})
hijo.on('exit', (code) => process.exit(code ?? 0))
