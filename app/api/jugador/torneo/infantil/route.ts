import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { COLUMNAS_MENOR, categoriasInfantiles } from '@/lib/torneoInfantilServidor'
import { obtenerTasaVigente, tasaParaCalculo } from '@/lib/tasaBcv'
import { montoInscripcionBs, textoPendiente } from '@/lib/torneoInscripcion'
import { fechaCorteEdad, pendientesInscripcionMenor } from '@/lib/torneoInfantil'
import type { EstadoInscripcion } from '@/lib/torneo'

// Todo lo que necesita "Inscribir a mi hijo/a": torneo vigente, categorías
// infantiles con cupo, mis representados (fichas reutilizables entre
// torneos) con sus inscripciones de este torneo, pagos y pendientes, y el
// monto en Bs. de hoy. Solo devuelve fichas cuyo representante soy yo.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)

    const { data: menores, error: errMen } = await db
      .from('torneo_menores')
      .select(COLUMNAS_MENOR)
      .eq('representante_jugador_id', session.id)
      .order('created_at')
    if (errMen) throw errMen

    if (!torneo) return NextResponse.json({ ok: true, torneo: null, representados: menores || [] })

    const categorias = await categoriasInfantiles(db, torneo.id)
    const categoriaIds = categorias.map((c) => c.id)

    const { data: inscripciones, error: errIns } = categoriaIds.length
      ? await db
          .from('torneo_inscripciones')
          .select('id, categoria_id, menor_id, estado, categoria_certificada_at, created_at')
          .in('categoria_id', categoriaIds)
          .neq('estado', 'retirada')
      : { data: [], error: null }
    if (errIns) throw errIns

    const ocupados: Record<string, number> = {}
    for (const i of inscripciones || []) ocupados[i.categoria_id] = (ocupados[i.categoria_id] || 0) + 1

    const misMenorIds = new Set((menores || []).map((m) => m.id))
    const mias = (inscripciones || []).filter((i) => i.menor_id && misMenorIds.has(i.menor_id))

    const { data: pagos, error: errPag } = mias.length
      ? await db
          .from('pagos')
          .select('id, numero_recibo, jugador_id, torneo_inscripcion_id, tipo_pago, monto, fecha, referencia, validado, tasa_bcv_eur')
          .in('torneo_inscripcion_id', mias.map((i) => i.id))
          .order('fecha', { ascending: false })
      : { data: [] as any[], error: null }
    if (errPag) throw errPag

    const catPorId = new Map(categorias.map((c) => [c.id, c]))
    const representados = (menores || []).map((m) => ({
      ...m,
      inscripciones: mias
        .filter((i) => i.menor_id === m.id)
        .map((i) => {
          const suyos = (pagos || []).filter((p: any) => p.torneo_inscripcion_id === i.id)
          const pendientes = pendientesInscripcionMenor({
            estado: i.estado as EstadoInscripcion,
            menorId: m.id,
            representanteJugadorId: session.id,
            certificada: !!i.categoria_certificada_at,
            pagos: suyos.map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
          })
          return {
            id: i.id,
            estado: i.estado,
            categoria: { id: i.categoria_id, nombre: catPorId.get(i.categoria_id)?.nombre || '—' },
            certificada: !!i.categoria_certificada_at,
            pendientes: pendientes.map((p) => ({ ...p, texto: textoPendiente(p, null) })),
            pagos: suyos,
          }
        }),
    }))

    const tasa = await obtenerTasaVigente(db)

    return NextResponse.json({
      ok: true,
      torneo,
      fechaCorte: fechaCorteEdad(torneo),
      categorias: categorias.map((c) => ({ ...c, ocupados: ocupados[c.id] || 0 })),
      representados,
      tasa: tasa ? { fecha_vigencia: tasa.fecha_vigencia, eur: tasaParaCalculo(tasa.eur), montoBs: montoInscripcionBs(torneo.monto_inscripcion_eur, tasa.eur) } : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar la sección infantil' }, { status: 500 })
  }
}
