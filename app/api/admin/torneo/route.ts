import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { COLUMNAS_INVITACION, vencerInvitaciones } from '@/lib/torneoDoblesServidor'
import { pendientesInscripcion, textoPendiente } from '@/lib/torneoInscripcion'
import { COLUMNAS_MENOR } from '@/lib/torneoInfantilServidor'
import { edadAlCorte, fechaCorteEdad, pendientesInscripcionMenor } from '@/lib/torneoInfantil'
import type { Nivel } from '@/lib/torneo'

// Pestaña Torneo del admin: torneo vigente, categorías e inscripciones con
// sus jugadores, pagos, pendientes y limitaciones de horario; en dobles,
// además, las duplas activas y las invitaciones pendientes. La pueden ver
// los dos niveles de admin (el de pagos valida los pagos del torneo).
// Las inscripciones infantiles traen la ficha del menor (con su edad al
// corte y su representante) en vez de jugadores.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null })

    const { data: categorias, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, nombre, modalidad, genero, categoria_nivel, cupo, orden, es_infantil, inscripciones_abiertas, inscripciones_cambiadas_at, admin_cambio:inscripciones_cambiadas_por(nombre), edad_min, edad_max, duracion_min, formato_partido, plantilla_turnos, sorteo_publicado_at, sorteo_metodo, cancelada_at, fusionada_en, num_grupos, llave_desde, partidos_minimos')
      .eq('torneo_id', torneo.id)
      .order('orden')
    if (errCat) throw errCat
    const categoriaIds = (categorias || []).map((c) => c.id)

    const { data: inscripciones, error: errIns } = categoriaIds.length
      ? await db
          .from('torneo_inscripciones')
          .select('id, categoria_id, jugador1_id, jugador2_id, menor_id, menor_nombre_publico, categoria_certificada_at, invitado_autorizado_at, devolucion_marcada_at, estado, inscrita_por, inscrita_por_admin, created_at')
          .in('categoria_id', categoriaIds)
          .order('created_at')
      : { data: [], error: null }
    if (errIns) throw errIns

    // Duplas (y equipos de single/infantil) activas e invitaciones pendientes
    // de dobles. Antes, las que vencieron pasan a 'vencida' (sin cron).
    await vencerInvitaciones(db, (categorias || []).filter((c) => c.modalidad === 'doble').map((c) => c.id))
    const [{ data: equipos, error: errEq }, { data: invitaciones, error: errInv }] = categoriaIds.length
      ? await Promise.all([
          db.from('torneo_equipos').select('id, categoria_id, inscripcion1_id, inscripcion2_id, origen, siembra, bombo, created_at').in('categoria_id', categoriaIds).eq('estado', 'activo').order('created_at'),
          db.from('torneo_invitaciones').select(COLUMNAS_INVITACION).in('categoria_id', categoriaIds).eq('estado', 'pendiente').order('vence_at'),
        ])
      : [{ data: [], error: null }, { data: [], error: null }]
    if (errEq) throw errEq
    if (errInv) throw errInv

    const inscripcionIds = (inscripciones || []).map((i) => i.id)
    const menorIds = [...new Set((inscripciones || []).map((i) => i.menor_id).filter(Boolean))] as string[]
    const { data: menores, error: errMen } = menorIds.length
      ? await db.from('torneo_menores').select(COLUMNAS_MENOR).in('id', menorIds)
      : { data: [] as any[], error: null }
    if (errMen) throw errMen
    const menorPorId = new Map((menores || []).map((m: any) => [m.id, m]))

    // Los representantes con cuenta también se leen de jugadores (nombre y contacto).
    const jugadorIds = [...new Set([
      ...(inscripciones || []).flatMap((i) => [i.jugador1_id, i.jugador2_id]),
      ...(invitaciones || []).map((v: any) => v.invitado_jugador_id),
      ...(menores || []).map((m: any) => m.representante_jugador_id),
    ].filter(Boolean))] as string[]

    const [{ data: jugadores, error: errJug }, { data: pagos, error: errPag }, { data: disponibilidad, error: errDisp }, { data: activos, error: errAct }] = await Promise.all([
      jugadorIds.length
        ? db.from('jugadores').select('id, nombre, genero, categoria, categoria_torneo, telefono, email, es_invitado').in('id', jugadorIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      inscripcionIds.length
        ? db
            .from('pagos')
            .select('id, numero_recibo, jugador_id, torneo_inscripcion_id, tipo_pago, monto, fecha, referencia, validado, tasa_bcv_eur, created_at')
            .in('torneo_inscripcion_id', inscripcionIds)
            .order('created_at')
        : Promise.resolve({ data: [] as any[], error: null }),
      db.from('torneo_disponibilidad').select('jugador_id, no_disponible, nota, updated_at').eq('torneo_id', torneo.id),
      // Para elegir al representante con cuenta al inscribir a un menor.
      db.from('jugadores').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    if (errAct) throw errAct
    if (errJug) throw errJug
    if (errPag) throw errPag
    if (errDisp) throw errDisp

    const { data: publicador, error: errPub } = torneo.sorteo_publicado_por
      ? await db.from('administradores').select('nombre').eq('id', torneo.sorteo_publicado_por).maybeSingle()
      : { data: null, error: null }
    if (errPub) throw errPub

    const jugadorPorId = new Map((jugadores || []).map((j: any) => [j.id, j]))
    const catPorId = new Map((categorias || []).map((c) => [c.id, c]))

    const filas = (inscripciones || []).map((i) => {
      if (i.menor_id) {
        const m = menorPorId.get(i.menor_id)
        const rep = m ? jugadorPorId.get(m.representante_jugador_id) : null
        const suyos = (pagos || []).filter((p: any) => p.torneo_inscripcion_id === i.id)
        const pendientes = i.estado === 'retirada' || !m ? [] : pendientesInscripcionMenor({
          estado: i.estado,
          menorId: m.id,
          representanteJugadorId: m.representante_jugador_id,
          certificada: !!i.categoria_certificada_at,
          pagos: suyos.map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
          soloSocios: torneo.solo_socios,
          menorConAccion: !!m.numero_accion?.trim(),
          invitadoAutorizado: !!i.invitado_autorizado_at,
        })
        return {
          ...i,
          jugadores: [],
          menor: m ? {
            ...m,
            edad_al_corte: edadAlCorte(m.fecha_nacimiento, torneo),
            representante: { jugador_id: m.representante_jugador_id, nombre: rep?.nombre ?? null, telefono: rep?.telefono ?? null, email: rep?.email ?? null },
          } : null,
          pagos: suyos,
          pendientes: pendientes.map((p) => ({
            ...p,
            texto: textoPendiente(p, p.jugadorId === m?.id ? m.nombre : rep?.nombre || 'el representante'),
          })),
        }
      }
      const ids = [i.jugador1_id, i.jugador2_id].filter(Boolean) as string[]
      const suyos = (pagos || []).filter((p: any) => p.torneo_inscripcion_id === i.id)
      const pendientes = i.estado === 'retirada' ? [] : pendientesInscripcion({
        estado: i.estado,
        nivelCategoria: catPorId.get(i.categoria_id)!.categoria_nivel as Nivel | null,
        jugadores: ids.map((id) => ({ id, categoria_torneo: jugadorPorId.get(id)?.categoria_torneo ?? null, es_invitado: !!jugadorPorId.get(id)?.es_invitado })),
        pagos: suyos.map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
        soloSocios: torneo.solo_socios,
        invitadoAutorizado: !!i.invitado_autorizado_at,
      })
      return {
        ...i,
        jugadores: ids.map((id) => jugadorPorId.get(id)).filter(Boolean),
        menor: null,
        pagos: suyos,
        pendientes: pendientes.map((p) => ({ ...p, texto: textoPendiente(p, jugadorPorId.get(p.jugadorId)?.nombre || '—') })),
      }
    })

    return NextResponse.json({
      ok: true,
      torneo,
      fechaCorte: fechaCorteEdad(torneo),
      categorias: categorias || [],
      inscripciones: filas,
      equipos: equipos || [],
      invitaciones: (invitaciones || []).map((v: any) => ({
        id: v.id, categoria_id: v.categoria_id, invita_inscripcion_id: v.invita_inscripcion_id, vence_at: v.vence_at,
        para: (v.invitado_jugador_id && jugadorPorId.get(v.invitado_jugador_id)?.nombre) || v.invitado_nombre || '—',
        telefono: v.invitado_jugador_id ? null : v.invitado_telefono,
      })),
      disponibilidad: disponibilidad || [],
      jugadoresActivos: activos || [],
      sorteoPublicadoPor: publicador?.nombre ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el torneo' }, { status: 500 })
  }
}
