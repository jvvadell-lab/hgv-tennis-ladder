// Script de un solo uso: re-comprime en el servidor las imágenes ya existentes en el
// bucket "fotos-partidos" (subidas antes del fix de compresión en cliente), para bajar
// el egress de Supabase Storage. Descarga cada archivo, lo redimensiona/recomprime con
// sharp, y lo vuelve a subir al MISMO path (upsert) — no rompe foto_carnet_url ni foto_url.
//
// Por defecto corre en modo dry-run: descarga, mide, y solo imprime la tabla — no sube
// nada. Pasa --apply para sobrescribir de verdad en producción.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/recomprimir-fotos-partidos.ts
//   npx tsx --env-file=.env.local scripts/recomprimir-fotos-partidos.ts --apply

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const BUCKET = 'fotos-partidos'
const CALIDAD = 78
const APLICAR = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  throw new Error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

type Archivo = { path: string; size: number; mimetype: string }

// Los logos de Sponsors son assets estáticos del sitio, no fotos de usuario — no se tocan.
const CARPETAS_EXCLUIDAS = ['Sponsors']

function maxAnchoPara(path: string): number | null {
  if (CARPETAS_EXCLUIDAS.some((c) => path.startsWith(`${c}/`))) return null
  if (path.startsWith('carnets/')) return 1000
  return 1600 // fotos de partido e informes médicos
}

async function listarRecursivo(prefijo: string): Promise<Archivo[]> {
  const { data, error } = await db.storage.from(BUCKET).list(prefijo, { limit: 1000 })
  if (error) throw error
  const archivos: Archivo[] = []
  for (const entrada of data || []) {
    const path = prefijo ? `${prefijo}/${entrada.name}` : entrada.name
    if (entrada.id === null) {
      // Es una "carpeta" (prefijo) — recursión
      archivos.push(...(await listarRecursivo(path)))
    } else {
      archivos.push({
        path,
        size: entrada.metadata?.size ?? 0,
        mimetype: entrada.metadata?.mimetype ?? '',
      })
    }
  }
  return archivos
}

async function main() {
  console.log(`Modo: ${APLICAR ? 'APLICAR (sobrescribe producción)' : 'DRY-RUN (solo mide, no sube nada)'}\n`)

  const todos = await listarRecursivo('')
  const candidatos = todos.filter((a) => a.mimetype.startsWith('image/') && maxAnchoPara(a.path) !== null)
  const excluidos = todos.length - candidatos.length

  console.log(`${todos.length} archivos en el bucket — ${candidatos.length} candidatos a recomprimir, ${excluidos} excluidos (Sponsors u otro tipo).\n`)

  const filas: { path: string; original: number; nuevo: number; ahorro: string; accion: string }[] = []
  let totalOriginal = 0
  let totalNuevo = 0
  let totalSubidos = 0

  for (const archivo of candidatos) {
    const maxAncho = maxAnchoPara(archivo.path)!
    const { data: blob, error: errDescarga } = await db.storage.from(BUCKET).download(archivo.path)
    if (errDescarga || !blob) {
      filas.push({ path: archivo.path, original: archivo.size, nuevo: 0, ahorro: '—', accion: `ERROR descarga: ${errDescarga?.message}` })
      continue
    }
    const bufferOriginal = Buffer.from(await blob.arrayBuffer())

    let bufferNuevo: Buffer
    try {
      bufferNuevo = await sharp(bufferOriginal)
        .resize({ width: maxAncho, withoutEnlargement: true })
        .jpeg({ quality: CALIDAD })
        .toBuffer()
    } catch (err: any) {
      filas.push({ path: archivo.path, original: archivo.size, nuevo: 0, ahorro: '—', accion: `ERROR al procesar: ${err.message}` })
      continue
    }

    totalOriginal += bufferOriginal.length
    const mejora = bufferNuevo.length < bufferOriginal.length
    const ahorro = mejora ? `${(100 - (bufferNuevo.length * 100) / bufferOriginal.length).toFixed(1)}%` : '0% (sin mejora)'
    totalNuevo += mejora ? bufferNuevo.length : bufferOriginal.length

    let accion = mejora ? (APLICAR ? 'subido' : 'pendiente (dry-run)') : 'sin cambios (ya es más chico o igual)'

    if (mejora && APLICAR) {
      const { error: errSubida } = await db.storage
        .from(BUCKET)
        .upload(archivo.path, bufferNuevo, { contentType: 'image/jpeg', upsert: true })
      if (errSubida) {
        accion = `ERROR al subir: ${errSubida.message}`
      } else {
        totalSubidos++
      }
    }

    filas.push({ path: archivo.path, original: bufferOriginal.length, nuevo: mejora ? bufferNuevo.length : bufferOriginal.length, ahorro, accion })
  }

  const fmt = (b: number) => `${(b / 1024).toFixed(0)} KB`
  console.log('path'.padEnd(70), 'original'.padStart(10), 'nuevo'.padStart(10), 'ahorro'.padStart(10), '  acción')
  for (const f of filas) {
    console.log(f.path.padEnd(70), fmt(f.original).padStart(10), fmt(f.nuevo).padStart(10), f.ahorro.padStart(10), ' ', f.accion)
  }

  console.log('\n--- Totales ---')
  console.log(`Original: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Nuevo:    ${(totalNuevo / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Ahorro:   ${(100 - (totalNuevo * 100) / totalOriginal).toFixed(1)}%`)
  if (APLICAR) console.log(`Archivos sobrescritos: ${totalSubidos}`)
  else console.log('\nEsto fue un dry-run — no se subió nada. Corre con --apply para aplicar de verdad.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
