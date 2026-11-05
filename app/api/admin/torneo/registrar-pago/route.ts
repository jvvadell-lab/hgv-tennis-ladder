import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { hoyEnCaracas } from '@/lib/tiempo'
import { obtenerTasaVigente, tasaParaCalculo } from '@/lib/tasaBcv'
import { avisarInscripcionConfirmada, escaparHtml, notificarJugadores, recalcularInscripcion, torneoVigente } from '@/lib/torneoServidor'
import { montoInscripcionBs, pendientePagoDe } from '@/lib/torneoInscripcion'

// El admin registra el pago de inscripción de un jugador (o del
// representante de un menor) que pagó por fuera de la app. Mismo cálculo
// que el reporte del jugador (monto en € de la inscripción × tasa BCV del
// euro del día del pago), pero el admin puede corregir el monto en Bs. y el
// pago queda validado de una vez. Después recalcula la inscripción y avisa.
const TIPOS_ADMIN = ['pago_movil', 'transferencia', 'efectivo'] as const

type Pendiente = {
  inscripcionId: string
  pagadorId: string
  pagadorNombre: string
  nombre: string            // jugador, o el menor
  categoria: string
  categoriaOrden: number
  montoEur: number          // lo que falta: el monto, o el saldo
  esSaldo: boolean
}

// GET: inscripciones vivas del torneo vigente con alguien que todavía no
// tiene pago vivo (por validar o validado), para elegir en el formulario.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, pendientes: [], tasa: null })

    const { data: inscripciones, error } = await db
      .from('torneo_inscripciones')
      .select('id, jugador1_id, monto_eur, menor_nombre_publico, jugadores:jugador1_id(nombre), torneo_menores:menor_id(nombre, apellido, representante_jugador_id, representante:representante_jugador_id(nombre)), torneo_categorias!inner(nombre, orden, torneo_id)')
      .eq('torneo_categorias.torneo_id', torneo.id)
      .neq('estado', 'retirada')
    if (error) throw error

    const ids = (inscripciones || []).map((i: any) => i.id)
    const { data: pagos, error: errP } = ids.length
      ? await db.from('pagos').select('torneo_inscripcion_id, jugador_id, validado, monto, tasa_bcv_eur').in('torneo_inscripcion_id', ids)
      : { data: [] as any[], error: null }
    if (errP) throw errP

    const pendientes: Pendiente[] = []
    for (const i of (inscripciones || []) as any[]) {
      const menor = i.torneo_menores
      const pagadorId: string | null = menor ? menor.representante_jugador_id : i.jugador1_id
      if (!pagadorId) continue
      // Sin pago, o con saldo (el monto subió después de pagar).
      const suyos = (pagos || []).filter((p: any) => p.torneo_inscripcion_id === i.id).map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado, monto: p.monto, tasa_bcv_eur: p.tasa_bcv_eur }))
      const falta = pendientePagoDe(pagadorId, suyos, i.monto_eur)
      if (falta?.tipo !== 'pago' && falta?.tipo !== 'saldo') continue
      pendientes.push({
        inscripcionId: i.id,
        pagadorId,
        pagadorNombre: menor ? menor.representante?.nombre || '—' : i.jugadores?.nombre || '—',
        nombre: menor ? `${menor.nombre} ${menor.apellido}` : i.jugadores?.nombre || '—',
        categoria: i.torneo_categorias?.nombre || '',
        categoriaOrden: i.torneo_categorias?.orden ?? 0,
        montoEur: falta.tipo === 'saldo' ? falta.saldoEur : Number(i.monto_eur),
        esSaldo: falta.tipo === 'saldo',
      })
    }
    pendientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    const tasa = await obtenerTasaVigente(db)
    return NextResponse.json({ ok: true, pendientes, tasa: tasa ? { fecha_vigencia: tasa.fecha_vigencia, eur: tasaParaCalculo(tasa.eur) } : null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar las inscripciones' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { inscripcionId, tipoPago, fecha, referencia, montoBs } = await request.json()
    if (typeof inscripcionId !== 'string' || !inscripcionId) return NextResponse.json({ error: 'Elige la inscripción' }, { status: 400 })
    if (!(TIPOS_ADMIN as readonly string[]).includes(tipoPago)) return NextResponse.json({ error: 'Tipo de pago no válido' }, { status: 400 })
    const ref = typeof referencia === 'string' ? referencia.trim() : ''
    if (tipoPago !== 'efectivo' && !ref) return NextResponse.json({ error: 'Escribe el número de referencia del pago' }, { status: 400 })

    const hoy = hoyEnCaracas()
    const fechaPago = fecha || hoy
    if (typeof fechaPago !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) return NextResponse.json({ error: 'La fecha del pago no es válida' }, { status: 400 })
    if (fechaPago > hoy) return NextResponse.json({ error: 'La fecha del pago no puede ser futura' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 400 })

    const { data: ins, error: errIns } = await db
      .from('torneo_inscripciones')
      .select('id, estado, jugador1_id, monto_eur, torneo_categorias:categoria_id(torneo_id, nombre), torneo_menores:menor_id(representante_jugador_id)')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errIns) throw errIns
    if (!ins || (ins.torneo_categorias as any)?.torneo_id !== torneo.id) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
    if (ins.estado === 'retirada') return NextResponse.json({ error: 'Esa inscripción está retirada' }, { status: 400 })
    // Paga el jugador, o el representante del menor (SPEC §14.2).
    const pagadorId: string | null = (ins.torneo_menores as any)?.representante_jugador_id ?? ins.jugador1_id
    if (!pagadorId) return NextResponse.json({ error: 'La inscripción no tiene a quién cargarle el pago' }, { status: 400 })

    const { data: existentes, error: errEx } = await db
      .from('pagos')
      .select('numero_recibo, validado, jugador_id, monto, tasa_bcv_eur')
      .eq('torneo_inscripcion_id', ins.id)
      .eq('jugador_id', pagadorId)
    if (errEx) throw errEx
    // Sin pago, o con saldo pendiente (el monto subió después de pagar).
    const falta = pendientePagoDe(pagadorId, (existentes || []).map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado, monto: p.monto, tasa_bcv_eur: p.tasa_bcv_eur })), ins.monto_eur)
    if (falta?.tipo !== 'pago' && falta?.tipo !== 'saldo') {
      const e = (existentes || [])[0]
      return NextResponse.json({ error: e ? `Ya hay un pago en esta inscripción (recibo #${e.numero_recibo}${e.validado ? ', validado' : ', por validar: valídalo en la lista'})` : 'Esta inscripción no tiene pago pendiente' }, { status: 400 })
    }
    const montoEurAPagar = falta.tipo === 'saldo' ? falta.saldoEur : Number(ins.monto_eur)

    const tasa = await obtenerTasaVigente(db, fechaPago)
    if (!tasa) return NextResponse.json({ error: 'No hay tasa BCV registrada para esa fecha' }, { status: 400 })
    const tasaEur = tasaParaCalculo(tasa.eur)
    const calculado = montoInscripcionBs(montoEurAPagar, tasa.eur)
    const elegido = montoBs === undefined || montoBs === null || montoBs === '' ? calculado : Number(montoBs)
    if (!Number.isFinite(elegido) || elegido <= 0) return NextResponse.json({ error: 'El monto en Bs. no es válido' }, { status: 400 })
    const monto = Math.round(elegido * 100) / 100

    const { data: creado, error } = await db
      .from('pagos')
      .insert({
        jugador_id: pagadorId,
        temporada_id: null,
        torneo_inscripcion_id: ins.id,
        tipo_pago: tipoPago,
        monto,
        fecha: fechaPago,
        referencia: ref || null,
        tasa_bcv_eur: tasaEur,
        validado: true, // lo registra el admin: queda validado
      })
      .select('numero_recibo')
      .single()
    if (error) throw error

    const r = await recalcularInscripcion(db, ins.id)
    if (r.antes !== 'confirmada' && r.despues === 'confirmada') {
      await avisarInscripcionConfirmada(db, r)
    } else {
      const textoMonto = monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      await notificarJugadores(db, [pagadorId], {
        tipo: 'torneo_pago_validado',
        mensaje: `💳 El club registró tu pago de inscripción en ${r.categoriaNombre} (Bs. ${textoMonto}).`,
        asunto: `💳 Pago registrado — ${r.torneoNombre}`,
        cuerpoHtml: () => `
          <p>El club registró tu pago de inscripción en <strong>${escaparHtml(r.categoriaNombre)}</strong> por <strong>Bs. ${textoMonto}</strong> (recibo #${creado.numero_recibo}).</p>
          <p>La inscripción se confirma cuando estén validados los pagos de todos sus jugadores y su categoría.</p>
        `,
      })
    }

    return NextResponse.json({ ok: true, numeroRecibo: creado.numero_recibo, monto, montoCalculado: calculado, estadoInscripcion: r.despues })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al registrar el pago' }, { status: 500 })
  }
}
