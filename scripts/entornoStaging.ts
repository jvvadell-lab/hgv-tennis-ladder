// Carga y verifica el entorno de pruebas local (.env.local.staging), para
// scripts/dev-staging.ts y scripts/simular-torneo.ts.
//
// Se NIEGA a seguir si la URL de Supabase no es local (localhost /
// 127.0.0.1) o si menciona el proyecto de producción, para que nada de
// esto pueda escribir en producción por error.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const REF_PRODUCCION = 'znfsxpmmlxezzeasjtqa'
export const ARCHIVO_STAGING = '.env.local.staging'

export function leerEnvStaging(raiz = process.cwd()): Record<string, string> {
  const ruta = resolve(raiz, ARCHIVO_STAGING)
  let texto: string
  try {
    texto = readFileSync(ruta, 'utf8')
  } catch {
    throw new Error(`No existe ${ARCHIVO_STAGING}. Créalo con los datos que imprime "npx supabase status" (ver scripts/README-simulacion.md).`)
  }
  const vars: Record<string, string> = {}
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    vars[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  verificarEsLocal(vars.NEXT_PUBLIC_SUPABASE_URL)
  for (const clave of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET']) {
    if (!vars[clave]) throw new Error(`Falta ${clave} en ${ARCHIVO_STAGING}`)
  }
  if (vars.CORREOS_DESACTIVADOS !== '1') throw new Error(`${ARCHIVO_STAGING} tiene que tener CORREOS_DESACTIVADOS=1 (que no salga ningún correo)`)
  return vars
}

export function verificarEsLocal(url: string | undefined): void {
  if (!url) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL')
  if (url.includes(REF_PRODUCCION)) throw new Error('ALTO: la URL de Supabase es la de PRODUCCIÓN. No se corre nada.')
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`URL de Supabase no válida: ${url}`)
  }
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`ALTO: la URL de Supabase (${host}) no es local. Este entorno solo corre contra el Supabase local (localhost / 127.0.0.1).`)
  }
}
