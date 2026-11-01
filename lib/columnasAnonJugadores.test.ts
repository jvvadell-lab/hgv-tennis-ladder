import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// La clave anónima (navegador) solo puede leer algunas columnas de
// jugadores (20261022124304_jugadores_cerrar_columnas_anon + grants
// posteriores). Si el código del navegador pide o filtra por otra columna,
// Postgres rechaza la consulta y la pantalla queda vacía SIN error visible:
// pasó con es_prueba el 30-oct-2026 (Dashboard y desplegables del admin).
// Este test revisa los archivos 'use client' y avisa antes de publicar.
const COLUMNAS_ANON = new Set(['id', 'nombre', 'categoria', 'genero', 'activo', 'es_prueba'])

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return nombre === 'api' || nombre === 'node_modules' ? [] : archivos(ruta)
    return /\.(tsx?|jsx?)$/.test(nombre) && !nombre.includes('.test.') ? [ruta] : []
  })
}

// Devuelve las columnas usadas en cada cadena supabase.from('jugadores')...
// (select, eq/neq/in/is/order/ilike...) hasta el final de la sentencia.
function columnasUsadas(codigo: string): { columna: string; linea: number }[] {
  const usadas: { columna: string; linea: number }[] = []
  const re = /\.from\(\s*['"]jugadores['"]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(codigo))) {
    const resto = codigo.slice(m.index)
    const fin = resto.search(/\n\s*\n|;|\n\s*(const|let|set[A-Z]|if|return)\b/)
    const cadena = fin === -1 ? resto : resto.slice(0, fin)
    const linea = codigo.slice(0, m.index).split('\n').length
    const sel = cadena.match(/\.select\(\s*['"`]([^'"`]*)['"`]/)
    if (sel) {
      for (const parte of sel[1].split(',')) {
        const col = parte.trim().split(/[\s:(]/)[0]
        if (col && col !== '*' && !col.includes('.')) usadas.push({ columna: col, linea })
      }
    }
    for (const f of cadena.matchAll(/\.(eq|neq|in|is|not|gt|gte|lt|lte|like|ilike|order)\(\s*['"]([a-z_]+)['"]/g)) {
      usadas.push({ columna: f[2], linea })
    }
  }
  return usadas
}

describe('columnas de jugadores en el código del navegador', () => {
  it('solo usa columnas con grant de SELECT para anon', () => {
    const problemas: string[] = []
    for (const ruta of archivos(join(process.cwd(), 'app'))) {
      const codigo = readFileSync(ruta, 'utf8')
      if (!/^['"]use client['"]/m.test(codigo)) continue
      for (const { columna, linea } of columnasUsadas(codigo)) {
        if (!COLUMNAS_ANON.has(columna)) problemas.push(`${ruta.replace(process.cwd() + '/', '')}:${linea} usa jugadores.${columna}`)
      }
    }
    expect(problemas, 'Muévelo a un endpoint del servidor o agrega el grant a propósito').toEqual([])
  })

  it('detecta una columna sin grant (control del propio test)', () => {
    const ejemplo = `supabase.from('jugadores').select('id, email').eq('es_invitado', false)`
    const cols = columnasUsadas(ejemplo).map((u) => u.columna)
    expect(cols).toEqual(expect.arrayContaining(['id', 'email', 'es_invitado']))
  })
})
