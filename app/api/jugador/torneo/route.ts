import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { obtenerTasaVigente, tasaParaCalculo } from '@/lib/tasaBcv'
import { montoInscripcionBs, pendientesInscripcion, textoPendiente } from '@/lib/torneoInscripcion'
import type { Nivel } from '@/lib/torneo'

// Todo lo que necesita la pantalla "Inscribirme en el Torneo Navidad":
// torneo vigente, categorías con cupo, mis inscripciones con sus pagos y
// pendientes, mis limitaciones de horario, candidatos a pareja y el monto
// en Bs. de hoy.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null })

    const { data: yo, error: errYo } = await db
      .from('jugadores')
      .select('id, nombre, genero, categoria, categoria_torneo, es_invitado')
      .eq('id', session.id)
      .single()
    if (errYo) throw errYo

    const { data: categorias, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, nombre, modalidad, genero, categoria_nivel, cupo, duracion_min, orden')
      .eq('torneo_id', torneo.id)
      .eq('es_infantil', false) // las infantiles van por /api/jugador/torneo/infantil
      .order('orden')
    if (errCat) throw errCat
    const categoriaIds = (categorias || []).map((c) => c.id)

    const { data: inscripciones, error: errIns } = categoriaIds.length
      ? await db
          .from('torneo_inscripciones')
          .select('id, categoria_id, jugador1_id, jugador2_id, estado, invitado_autorizado_at, created_at')
          .in('categoria_id', categoriaIds)
          .neq('estado', 'retirada')
      : { data: [], error: null }
    if (errIns) throw errIns

    const ocupados: Record<string, number> = {}
    for (const i of inscripciones || []) ocupados[i.categoria_id] = (ocupados[i.categoria_id] || 0) + 1

    const mias = (inscripciones || []).filter((i) => i.jugador1_id === session.id || i.jugador2_id === session.id)
    const parejaIds = mias.map((i) => (i.jugador1_id === session.id ? i.jugador2_id : i.jugador1_id)).filter(Boolean) as string[]

    const [{ data: parejas, error: errPar }, { data: pagos, error: errPag }, { data: disponibilidad, error: errDisp }, { data: candidatos, error: errCand }] =
      await Promise.all([
        parejaIds.length
          ? db.from('jugadores').select('id, nombre, categoria_torneo, es_invitado').in('id', parejaIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        mias.length
          ? db
              .from('pagos')
              .select('id, numero_recibo, jugador_id, torneo_inscripcion_id, tipo_pago, monto, fecha, referencia, validado, tasa_bcv_eur')
              .in('torneo_inscripcion_id', mias.map((i) => i.id))
              .order('fecha', { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null }),
        db.from('torneo_disponibilidad').select('no_disponible, nota').eq('torneo_id', torneo.id).eq('jugador_id', session.id).maybeSingle(),
        db
          .from('jugadores')
          .select('id, nombre, genero, categoria, categoria_torneo')
          .eq('activo', true)
          .neq('estado_verificacion', 'no_permitido')
          .neq('id', session.id)
          .order('nombre'),
      ])
    if (errPar) throw errPar
    if (errPag) throw errPag
    if (errDisp) throw errDisp
    if (errCand) throw errCand

    const nombreDe = new Map<string, string>([[yo.id, yo.nombre], ...(parejas || []).map((p: any) => [p.id, p.nombre] as [string, string])])
    const categoriaTorneoDe = new Map<string, string | null>([[yo.id, yo.categoria_torneo], ...(parejas || []).map((p: any) => [p.id, p.categoria_torneo] as [string, string | null])])
    const esInvitadoDe = new Map<string, boolean>([[yo.id, !!yo.es_invitado], ...(parejas || []).map((p: any) => [p.id, !!p.es_invitado] as [string, boolean])])
    const catPorId = new Map((categorias || []).map((c) => [c.id, c]))

    const misInscripciones = mias.map((i) => {
      const categoria = catPorId.get(i.categoria_id)!
      const jugadorIds = [i.jugador1_id, i.jugador2_id].filter(Boolean) as string[]
      const suyos = (pagos || []).filter((p: any) => p.torneo_inscripcion_id === i.id)
      const pendientes = i.estado === 'retirada' ? [] : pendientesInscripcion({
        estado: i.estado,
        nivelCategoria: categoria.categoria_nivel as Nivel | null,
        jugadores: jugadorIds.map((id) => ({ id, categoria_torneo: categoriaTorneoDe.get(id) ?? null, es_invitado: esInvitadoDe.get(id) ?? false })),
        pagos: suyos.map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
        soloSocios: torneo.solo_socios,
        invitadoAutorizado: !!i.invitado_autorizado_at,
      })
      const parejaId = i.jugador1_id === session.id ? i.jugador2_id : i.jugador1_id
      return {
        id: i.id,
        categoria: { id: categoria.id, nombre: categoria.nombre, modalidad: categoria.modalidad },
        pareja: parejaId ? { id: parejaId, nombre: nombreDe.get(parejaId) || '—' } : null,
        estado: i.estado,
        pendientes: pendientes.map((p) => ({ ...p, texto: textoPendiente(p, p.jugadorId === session.id ? null : nombreDe.get(p.jugadorId) || '—') })),
        pagos: suyos.map((p: any) => ({ ...p, jugador_nombre: nombreDe.get(p.jugador_id) || '—' })),
      }
    })

    const tasa = await obtenerTasaVigente(db)
    const tasaEur = tasa ? tasaParaCalculo(tasa.eur) : null

    return NextResponse.json({
      ok: true,
      torneo,
      yo,
      categorias: (categorias || []).map((c) => ({ ...c, ocupados: ocupados[c.id] || 0 })),
      misInscripciones,
      disponibilidad: disponibilidad || { no_disponible: [], nota: null },
      candidatos: candidatos || [],
      tasa: tasa ? { fecha_vigencia: tasa.fecha_vigencia, eur: tasaEur, montoBs: montoInscripcionBs(torneo.monto_inscripcion_eur, tasa.eur) } : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el torneo' }, { status: 500 })
  }
}
