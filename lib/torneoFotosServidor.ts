// Foto de los partidos del torneo (SPEC §17) — lado servidor. El archivo pasa
// por aquí y se sube con el service role: la foto de un partido con un menor
// sin autorización no llega nunca al bucket, que es público.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ahora } from '@/lib/tiempo'
import { competidoresPorId, personasDe } from '@/lib/torneoEquiposServidor'
import { CARPETA_FOTOS, TEXTO_FALTA_AUTORIZACION, TIPOS_FOTO, aceptaFoto, errorArchivoFoto, rutaFotoTorneo } from '@/lib/torneoFotos'

type Resultado = { ok: true; fotoUrl: string | null } | { ok: false; error: string; status: number }
type Autor = { id: string; rol: 'jugador' | 'admin' }

const COLUMNAS = 'id, estado, equipo_a, equipo_b, foto_url'
const BUCKET = 'fotos-partidos'

// Equipos con algún menor sin autorización de imagen vigente. Mira las dos
// inscripciones del equipo.
export async function equiposSinAutorizacionImagen(db: SupabaseClient, equipoIds: string[]): Promise<Set<string>> {
  const competidores = await competidoresPorId(db, equipoIds)
  const dueno = new Map([...competidores.values()].flatMap((c) => c.inscripcionIds.map((id) => [id, c.id] as const)))
  if (!dueno.size) return new Set()
  const { data, error } = await db
    .from('torneo_inscripciones')
    .select('id, torneo_menores(autorizacion_imagen)')
    .in('id', [...dueno.keys()])
    .not('menor_id', 'is', null)
  if (error) throw error
  return new Set((data || [])
    .filter((i: any) => !i.torneo_menores?.autorizacion_imagen)
    .map((i) => dueno.get(i.id)!))
}

async function borrarDelBucket(db: SupabaseClient, url: string | null) {
  const ruta = rutaFotoTorneo(url)
  if (!ruta) return
  // La foto ya no está en el partido: un archivo huérfano no es motivo para fallar.
  const { error } = await db.storage.from(BUCKET).remove([ruta])
  if (error) console.error('No se pudo borrar la foto anterior', ruta, error.message)
}

export async function guardarFotoPartido(
  db: SupabaseClient,
  p: { partidoId: string; archivo: File; autor: Autor },
): Promise<Resultado> {
  const { data: partido, error } = await db.from('torneo_partidos').select(COLUMNAS).eq('id', p.partidoId).maybeSingle()
  if (error) throw error
  if (!partido) return { ok: false, error: 'Partido no encontrado', status: 404 }

  const equipos = [partido.equipo_a, partido.equipo_b].filter(Boolean) as string[]
  if (p.autor.rol === 'jugador') {
    const competidores = await competidoresPorId(db, equipos)
    const propias = [...competidores.values()].flatMap(personasDe)
    if (!propias.includes(p.autor.id)) return { ok: false, error: 'Este partido no es tuyo', status: 403 }
  }
  if (!aceptaFoto(partido)) return { ok: false, error: 'Solo se agrega foto a un partido jugado, con su resultado reportado', status: 400 }
  if ((await equiposSinAutorizacionImagen(db, equipos)).size) return { ok: false, error: TEXTO_FALTA_AUTORIZACION, status: 403 }

  const errorArchivo = errorArchivoFoto(p.archivo)
  if (errorArchivo) return { ok: false, error: errorArchivo, status: 400 }

  const ruta = `${CARPETA_FOTOS}${partido.id}-${Date.now()}.${TIPOS_FOTO[p.archivo.type]}`
  const { error: errSubida } = await db.storage.from(BUCKET).upload(ruta, p.archivo, { contentType: p.archivo.type, cacheControl: '31536000' })
  if (errSubida) throw errSubida
  const fotoUrl = db.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl

  const { error: errUpdate } = await db
    .from('torneo_partidos')
    .update({ foto_url: fotoUrl, foto_subida_por: p.autor.id, foto_subida_rol: p.autor.rol, foto_subida_at: ahora().toISOString() })
    .eq('id', partido.id)
  if (errUpdate) {
    await borrarDelBucket(db, fotoUrl)
    throw errUpdate
  }
  await borrarDelBucket(db, partido.foto_url)
  return { ok: true, fotoUrl }
}

// Quitar la foto (admin): el partido y su marcador quedan intactos. Sale también
// del bucket: si no, su URL pública seguiría abriendo.
export async function quitarFotoPartido(db: SupabaseClient, partidoId: string): Promise<Resultado> {
  const { data: partido, error } = await db.from('torneo_partidos').select(COLUMNAS).eq('id', partidoId).maybeSingle()
  if (error) throw error
  if (!partido) return { ok: false, error: 'Partido no encontrado', status: 404 }
  const { error: errUpdate } = await db
    .from('torneo_partidos')
    .update({ foto_url: null, foto_subida_por: null, foto_subida_rol: null, foto_subida_at: null })
    .eq('id', partidoId)
  if (errUpdate) throw errUpdate
  await borrarDelBucket(db, partido.foto_url)
  return { ok: true, fotoUrl: null }
}
