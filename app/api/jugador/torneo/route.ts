import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { obtenerTasaVigente, tasaParaCalculo } from '@/lib/tasaBcv'
import { cupoInscripciones, montoInscripcionBs, pendientesInscripcion, textoPendiente } from '@/lib/torneoInscripcion'
import { candidatosPareja, estadoEnDobles, invitacionVigente, type JugadorDobles } from '@/lib/torneoDobles'
import { COLUMNAS_INVITACION, despuesDelCierre, vencerInvitaciones, vincularInvitacionesPorTelefono, type Invitacion } from '@/lib/torneoDoblesServidor'
import { ahora } from '@/lib/tiempo'
import { listasDeEspera, revisarCierreVencido } from '@/lib/torneoCierreServidor'
import type { Nivel } from '@/lib/torneo'

// Todo lo que necesita la pantalla "Inscribirme en el Torneo Navidad":
// torneo vigente, categorías con cupo, mis inscripciones con sus pagos y
// pendientes (en dobles: mi estado, mi pareja, la invitación que envié y la
// lista para elegir pareja), las invitaciones que recibí, mis limitaciones
// de horario y el monto en Bs. de hoy.
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
      .select('id, nombre, genero, categoria, categoria_torneo, es_invitado, telefono')
      .eq('id', session.id)
      .single()
    if (errYo) throw errYo

    const { data: categorias, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, nombre, modalidad, genero, categoria_nivel, cupo, inscripciones_abiertas, inscripciones_cambiadas_at, duracion_min, orden, sorteo_publicado_at, cancelada_at')
      .eq('torneo_id', torneo.id)
      .eq('es_infantil', false) // las infantiles van por /api/jugador/torneo/infantil
      .order('orden')
    if (errCat) throw errCat
    const categoriaIds = (categorias || []).map((c) => c.id)

    const doblesIds = (categorias || []).filter((c) => c.modalidad === 'doble').map((c) => c.id)
    // Al leer: vencen las invitaciones cuyo plazo pasó y se asignan las que
    // me hicieron a mi teléfono antes de tener cuenta.
    await vencerInvitaciones(db, doblesIds)
    // Si pasó el cierre programado con categorías abiertas, avisa a los admins (una vez).
    await revisarCierreVencido(db, torneo).catch((e) => console.error('[torneo] cierre vencido:', e.message))
    await vincularInvitacionesPorTelefono(db, session.id, yo.telefono)

    const [{ data: inscripciones, error: errIns }, { data: equipos, error: errEq }, { data: invitaciones, error: errInv }] = await Promise.all([
      categoriaIds.length
        ? db
            .from('torneo_inscripciones')
            .select('id, categoria_id, jugador1_id, estado, invitado_autorizado_at, created_at')
            .in('categoria_id', categoriaIds)
            .neq('estado', 'retirada')
        : Promise.resolve({ data: [] as any[], error: null }),
      doblesIds.length
        ? db.from('torneo_equipos').select('id, categoria_id, inscripcion1_id, inscripcion2_id, estado').in('categoria_id', doblesIds).eq('estado', 'activo')
        : Promise.resolve({ data: [] as any[], error: null }),
      doblesIds.length
        ? db.from('torneo_invitaciones').select(COLUMNAS_INVITACION).in('categoria_id', doblesIds).eq('estado', 'pendiente')
        : Promise.resolve({ data: [] as any[], error: null }),
    ])
    if (errIns) throw errIns
    if (errEq) throw errEq
    if (errInv) throw errInv
    const momento = ahora()
    const pendientesVigentes = ((invitaciones || []) as Invitacion[]).filter((i) => invitacionVigente(i, momento))

    const ocupados: Record<string, number> = {}
    for (const i of inscripciones || []) ocupados[i.categoria_id] = (ocupados[i.categoria_id] || 0) + 1
    const duplas: Record<string, number> = {}
    for (const e of equipos || []) duplas[e.categoria_id] = (duplas[e.categoria_id] || 0) + 1

    const insPorId = new Map((inscripciones || []).map((i) => [i.id, i]))
    const mias = (inscripciones || []).filter((i) => i.jugador1_id === session.id)
    const parejaDe = (insId: string) => {
      const e = (equipos || []).find((x: any) => x.inscripcion1_id === insId || x.inscripcion2_id === insId)
      if (!e) return null
      const otra = insPorId.get(e.inscripcion1_id === insId ? e.inscripcion2_id : e.inscripcion1_id)
      return otra ? { equipoId: e.id as string, jugadorId: otra.jugador1_id as string } : null
    }
    const recibidas = pendientesVigentes.filter((i) => i.invitado_jugador_id === session.id)

    // Nombres de todos los que aparecen (parejas, invitadores, invitados) y candidatos.
    const [{ data: pagos, error: errPag }, { data: disponibilidad, error: errDisp }, { data: candidatos, error: errCand }] =
      await Promise.all([
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
    if (errPag) throw errPag
    if (errDisp) throw errDisp
    if (errCand) throw errCand

    const nombreDe = new Map<string, string>([[yo.id, yo.nombre], ...(candidatos || []).map((c: any) => [c.id, c.nombre] as [string, string])])
    const catPorId = new Map((categorias || []).map((c) => [c.id, c]))
    // Categorías (ids) de cada jugador en el torneo, y su estado en cada una de dobles.
    const categoriasDe = new Map<string, string[]>()
    for (const i of inscripciones || []) categoriasDe.set(i.jugador1_id, [...(categoriasDe.get(i.jugador1_id) || []), i.categoria_id])

    const misInscripciones = mias.map((i) => {
      const categoria = catPorId.get(i.categoria_id)!
      const suyos = (pagos || []).filter((p: any) => p.torneo_inscripcion_id === i.id)
      const pendientes = pendientesInscripcion({
        estado: i.estado,
        nivelCategoria: categoria.categoria_nivel as Nivel | null,
        jugadores: [{ id: yo.id, categoria_torneo: yo.categoria_torneo, es_invitado: !!yo.es_invitado }],
        pagos: suyos.map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
        soloSocios: torneo.solo_socios,
        invitadoAutorizado: !!i.invitado_autorizado_at,
      })
      const pareja = categoria.modalidad === 'doble' ? parejaDe(i.id) : null
      const enviada = pendientesVigentes.find((v) => v.invita_inscripcion_id === i.id) ?? null
      let dobles = null
      if (categoria.modalidad === 'doble') {
        const delaCat = (inscripciones || []).filter((x) => x.categoria_id === categoria.id)
        const estadoEnCategoria = new Map(delaCat.map((x) => [x.jugador1_id as string, estadoEnDobles(x.id, (equipos || []) as any, pendientesVigentes, momento)]))
        const esperandoA = new Map(delaCat.flatMap((x) => {
          const v = pendientesVigentes.find((p) => p.invita_inscripcion_id === x.id)
          return v ? [[x.jugador1_id as string, (v.invitado_jugador_id && nombreDe.get(v.invitado_jugador_id)) || v.invitado_nombre || '—'] as [string, string]] : []
        }))
        dobles = {
          estado: estadoEnDobles(i.id, (equipos || []) as any, pendientesVigentes, momento),
          pareja: pareja ? { equipoId: pareja.equipoId, nombre: nombreDe.get(pareja.jugadorId) || '—' } : null,
          enviada: enviada ? {
            id: enviada.id,
            nombre: (enviada.invitado_jugador_id && nombreDe.get(enviada.invitado_jugador_id)) || enviada.invitado_nombre || '—',
            telefono: enviada.invitado_jugador_id ? null : enviada.invitado_telefono,
            vence_at: enviada.vence_at,
          } : null,
          candidatos: pareja ? [] : candidatosPareja({
            yo: yo as JugadorDobles, categoria, jugadores: (candidatos || []) as JugadorDobles[], estadoEnCategoria, esperandoA, categoriasDe,
            meInvitaron: new Set(recibidas.filter((v) => v.categoria_id === categoria.id).map((v) => insPorId.get(v.invita_inscripcion_id)?.jugador1_id).filter(Boolean)),
          }),
        }
      }
      return {
        id: i.id,
        categoria: { id: categoria.id, nombre: categoria.nombre, modalidad: categoria.modalidad },
        estado: i.estado,
        dobles,
        pendientes: pendientes.map((p) => ({ ...p, texto: textoPendiente(p, null) })),
        pagos: suyos.map((p: any) => ({ ...p, jugador_nombre: yo.nombre })),
      }
    })

    // Invitaciones que recibí: quién y en qué categoría (si no estaba inscrito, al aceptar me inscribo).
    const invitadores = new Map((inscripciones || []).map((x) => [x.id, x.jugador1_id as string]))
    const invitacionesRecibidas = recibidas.map((v) => ({
      id: v.id,
      categoria: { id: v.categoria_id, nombre: catPorId.get(v.categoria_id)?.nombre ?? '—' },
      de: nombreDe.get(invitadores.get(v.invita_inscripcion_id) ?? '') || '—',
      vence_at: v.vence_at,
      inscrito: mias.some((m) => m.categoria_id === v.categoria_id),
    }))

    // Mis anotaciones en lista de espera, con el puesto.
    const espera = await listasDeEspera(db, categoriaIds)
    const misEsperas = espera.filter((e) => e.jugador_id === session.id).map((e) => ({ categoriaId: e.categoria_id, puesto: e.puesto }))

    const tasa = await obtenerTasaVigente(db)
    const tasaEur = tasa ? tasaParaCalculo(tasa.eur) : null

    return NextResponse.json({
      ok: true,
      torneo,
      yo,
      // En dobles el cupo es de parejas: ocupados cuenta jugadores (cupo × 2) y duplas, las formadas.
      categorias: (categorias || []).map((c) => ({ ...c, ocupados: ocupados[c.id] || 0, cupoJugadores: cupoInscripciones(c), duplas: duplas[c.id] || 0 })),
      misInscripciones,
      invitacionesRecibidas,
      misEsperas,
      cierreInscripcionesAt: torneo.cierre_inscripciones_at,
      despuesDelCierre: despuesDelCierre(torneo),
      disponibilidad: disponibilidad || { no_disponible: [], nota: null },
      tasa: tasa ? { fecha_vigencia: tasa.fecha_vigencia, eur: tasaEur, montoBs: montoInscripcionBs(torneo.monto_inscripcion_eur, tasa.eur) } : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el torneo' }, { status: 500 })
  }
}
