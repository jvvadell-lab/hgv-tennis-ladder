import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { competidoresDeCategorias } from '@/lib/torneoEquiposServidor'
import { nombresInscripciones } from '@/lib/torneoSorteoServidor'
import { finDelDiaEnCaracas, inicioDelDiaEnCaracas } from '@/lib/tiempo'
import { COLUMNAS_PUBLICAS } from '@/lib/patrocinantes'

// Datos de la portada que no puede leer la clave anónima:
//  * torneo: el vigente (no finalizado; en borrador sale como "muy pronto") con cupos por categoría — duplas
//    formadas en dobles, inscritos en single e infantil — y sus partidos de
//    hoy cuando la programación está publicada (solo nombres públicos).
//  * patrocinantes: solo los activos.
// Es una vista pública y liviana: se cachea 60 s en el CDN.
export async function GET() {
  try {
    const db = supabaseServer()
    const [torneo, { data: patrocinantes, error: errP }] = await Promise.all([
      torneoVigente(db),
      db.from('patrocinantes').select(COLUMNAS_PUBLICAS).eq('activo', true).order('orden').order('created_at'),
    ])
    // Sin patrocinantes (p. ej. la tabla aún no existe) la portada sigue: solo sale sin cinta.
    if (errP) console.error('portada: patrocinantes', errP.message)

    let datosTorneo = null
    if (torneo) {
      const { data: categorias, error: errC } = await db
        .from('torneo_categorias')
        .select('id, nombre, modalidad, es_infantil, cupo, orden, inscripciones_abiertas, cancelada_at, fusionada_en')
        .eq('torneo_id', torneo.id)
        .order('orden')
      if (errC) throw errC
      const vigentes = (categorias || []).filter((c) => !c.cancelada_at && !c.fusionada_en)
      const equipos = await competidoresDeCategorias(db, vigentes.map((c) => c.id))

      // Partidos de hoy (hora de Caracas), solo si la programación ya salió.
      let partidosHoy: { id: string; categoria: string; fecha_hora: string; cancha: string | null; a: string; b: string }[] = []
      if (torneo.programacion_publicada_at && vigentes.length) {
        const hoy = new Date()
        const { data: partidos, error: errPa } = await db
          .from('torneo_partidos')
          .select('id, categoria_id, fecha_hora, cancha, equipo_a, equipo_b, estado')
          .in('categoria_id', vigentes.map((c) => c.id))
          .gte('fecha_hora', inicioDelDiaEnCaracas(hoy).toISOString())
          .lte('fecha_hora', finDelDiaEnCaracas(hoy).toISOString())
          .order('fecha_hora')
        if (errPa) throw errPa
        const nombres = await nombresInscripciones(db, equipos)
        const nombreCat = new Map(vigentes.map((c) => [c.id, c.nombre]))
        partidosHoy = (partidos || [])
          .filter((p) => p.fecha_hora && p.estado !== 'doble_wo')
          .map((p) => ({
            id: p.id,
            categoria: nombreCat.get(p.categoria_id) || '',
            fecha_hora: p.fecha_hora as string,
            cancha: p.cancha,
            a: (p.equipo_a && nombres.get(p.equipo_a)) || 'Por definir',
            b: (p.equipo_b && nombres.get(p.equipo_b)) || 'Por definir',
          }))
      }

      datosTorneo = {
        nombre: torneo.nombre,
        estado: torneo.estado,
        fecha_inicio: torneo.fecha_inicio,
        fecha_fin: torneo.fecha_fin,
        fecha_sorteo: torneo.fecha_sorteo,
        cierre_inscripciones_at: torneo.cierre_inscripciones_at,
        monto_inscripcion_eur: torneo.monto_inscripcion_eur,
        monto_inscripcion_adicional_eur: torneo.monto_inscripcion_adicional_eur,
        monto_inscripcion_invitado_eur: torneo.monto_inscripcion_invitado_eur ?? null,
        sorteado: !!torneo.sorteo_publicado_at,
        programacion_publicada: !!torneo.programacion_publicada_at,
        categorias: vigentes.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          es_infantil: c.es_infantil,
          modalidad: c.modalidad,
          cupo: c.cupo,
          inscritas: equipos.filter((e) => e.categoria_id === c.id).length,
          abiertas: torneo.estado === 'inscripcion' && c.inscripciones_abiertas,
        })),
        partidosHoy,
      }
    }

    return NextResponse.json(
      { ok: true, torneo: datosTorneo, patrocinantes: errP ? [] : patrocinantes || [] },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar la portada' }, { status: 500 })
  }
}
