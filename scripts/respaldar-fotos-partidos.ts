// Respaldo local de los originales de "fotos-partidos" antes de correr
// recomprimir-fotos-partidos.ts --apply. Descarga tal cual (sin tocar) cada archivo
// candidato a recompresión, preservando su path relativo dentro del bucket.
//
// Uso: npx tsx --env-file=.env.local scripts/respaldar-fotos-partidos.ts

import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const BUCKET = 'fotos-partidos'
const CARPETAS_EXCLUIDAS = ['Sponsors'] // logos estáticos, no se recomprimen ni se respaldan

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  throw new Error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

type Archivo = { path: string; mimetype: string }

async function listarRecursivo(prefijo: string): Promise<Archivo[]> {
  const { data, error } = await db.storage.from(BUCKET).list(prefijo, { limit: 1000 })
  if (error) throw error
  const archivos: Archivo[] = []
  for (const entrada of data || []) {
    const p = prefijo ? `${prefijo}/${entrada.name}` : entrada.name
    if (entrada.id === null) {
      archivos.push(...(await listarRecursivo(p)))
    } else {
      archivos.push({ path: p, mimetype: entrada.metadata?.mimetype ?? '' })
    }
  }
  return archivos
}

async function main() {
  const fecha = new Date().toISOString().slice(0, 10)
  const destino = path.join(process.cwd(), 'backups', `fotos-partidos-original-${fecha}`)

  const todos = await listarRecursivo('')
  const candidatos = todos.filter(
    (a) => a.mimetype.startsWith('image/') && !CARPETAS_EXCLUIDAS.some((c) => a.path.startsWith(`${c}/`))
  )

  console.log(`Respaldando ${candidatos.length} archivos en ${destino}\n`)

  let ok = 0
  for (const archivo of candidatos) {
    const { data: blob, error } = await db.storage.from(BUCKET).download(archivo.path)
    if (error || !blob) {
      console.error(`ERROR descargando ${archivo.path}: ${error?.message}`)
      continue
    }
    const destinoArchivo = path.join(destino, archivo.path)
    await mkdir(path.dirname(destinoArchivo), { recursive: true })
    await writeFile(destinoArchivo, Buffer.from(await blob.arrayBuffer()))
    ok++
    console.log(`✓ ${archivo.path}`)
  }

  console.log(`\n${ok}/${candidatos.length} archivos respaldados en ${destino}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
