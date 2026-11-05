import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { obtenerTasaVigente } from '@/lib/tasaBcv'
import { escaparHtml, notificarJugadores } from '@/lib/torneoServidor'
import { montoInscripcionBs, pendientePagoDe } from '@/lib/torneoInscripcion'
import { formatearEur } from '@/lib/torneoPrecios'

// Recordatorio de pago (campana + correo) a quien tiene una inscripción del
// torneo sin pago reportado o con saldo: el jugador, o el representante del
// menor. Cualquier nivel de admin (como validar pagos). No repite a la misma
// persona por la misma inscripción en las últimas 12 h, salvo forzar.
const HORAS_ENTRE_RECORDATORIOS = 12
const TIPO = 'torneo_recordatorio_pago'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const { inscripcionIds, forzar } = await request.json()
    if (!Array.isArray(inscripcionIds) || !inscripcionIds.length || inscripcionIds.length > 200 || inscripcionIds.some((x) => typeof x !== 'string')) {
      return NextResponse.json({ error: 'Faltan las inscripciones' }, { status: 400 })
    }

    const db = supabaseServer()
    const { data: inscripciones, error } = await db
      .from('torneo_inscripciones')
      .select('id, estado, jugador1_id, monto_eur, torneo_menores:menor_id(nombre, representante_jugador_id), torneo_categorias:categoria_id(nombre, torneos:torneo_id(nombre))')
      .in('id', inscripcionIds)
    if (error) throw error
    const { data: pagos, error: errP } = await db
      .from('pagos')
      .select('torneo_inscripcion_id, jugador_id, validado, monto, tasa_bcv_eur')
      .in('torneo_inscripcion_id', inscripcionIds)
    if (errP) throw errP

    const desde = new Date(Date.now() - HORAS_ENTRE_RECORDATORIOS * 3600_000).toISOString()
    const { data: recientes, error: errR } = await db
      .from('notificaciones')
      .select('jugador_id, mensaje')
      .eq('tipo', TIPO)
      .gte('created_at', desde)
    if (errR) throw errR

    const tasa = await obtenerTasaVigente(db)
    const enviados: string[] = []
    const omitidos: { nombre: string; motivo: string }[] = []

    for (const ins of (inscripciones || []) as any[]) {
      const menor = ins.torneo_menores
      const pagadorId: string | null = menor ? menor.representante_jugador_id : ins.jugador1_id
      const categoria = ins.torneo_categorias?.nombre || 'el torneo'
      const torneo = ins.torneo_categorias?.torneos?.nombre || 'Torneo Navidad'
      if (!pagadorId || ins.estado === 'retirada') continue
      const suyos = (pagos || []).filter((p: any) => p.torneo_inscripcion_id === ins.id).map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado, monto: p.monto, tasa_bcv_eur: p.tasa_bcv_eur }))
      const falta = pendientePagoDe(pagadorId, suyos, ins.monto_eur)
      const etiqueta = menor ? `${menor.nombre} (${categoria})` : categoria
      if (falta?.tipo !== 'pago' && falta?.tipo !== 'saldo') {
        omitidos.push({ nombre: etiqueta, motivo: falta?.tipo === 'pago_por_validar' ? 'ya reportó, falta validar' : 'ya pagó' })
        continue
      }
      const paraQuien = menor ? `la inscripción de ${menor.nombre} en ${categoria}` : `tu inscripción en ${categoria}`
      // El mensaje nombra la inscripción: así no se repite en 12 h.
      if (!forzar && (recientes || []).some((r: any) => r.jugador_id === pagadorId && r.mensaje?.includes(paraQuien))) {
        omitidos.push({ nombre: etiqueta, motivo: `ya se le recordó en las últimas ${HORAS_ENTRE_RECORDATORIOS} h` })
        continue
      }

      const eur = falta.tipo === 'saldo' ? falta.saldoEur : Number(ins.monto_eur)
      const bs = tasa ? montoInscripcionBs(eur, tasa.eur) : null
      const textoBs = bs ? ` (≈ Bs. ${bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a la tasa BCV de hoy)` : ''
      const queFalta = falta.tipo === 'saldo' ? `la diferencia de ${formatearEur(eur)}` : formatearEur(eur)
      const donde = menor ? 'Copa → Infantil y juvenil (Inscribir a mi hijo/a)' : 'Copa → Inscribirme'

      await notificarJugadores(db, [pagadorId], {
        tipo: TIPO,
        mensaje: `💳 Falta el pago de ${paraQuien}: ${queFalta}${textoBs}. Repórtalo en la app, en ${donde}.`,
        asunto: `💳 Falta tu pago — ${torneo}`,
        cuerpoHtml: () => `
          <p>Te recordamos que falta el pago de <strong>${escaparHtml(paraQuien)}</strong>: <strong>${escaparHtml(queFalta)}</strong>${escaparHtml(textoBs)}.</p>
          <div style="background: #fff8e1; border-left: 4px solid #f0b400; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
            Haz el pago móvil o la transferencia y repórtalo en la app, en <strong>${escaparHtml(donde)}</strong>. Ahí mismo están los datos para el pago y el monto exacto en bolívares del día.
          </div>
          <p>Tu inscripción queda confirmada cuando el club valide el pago.</p>
          <p><a href="https://hgv-tennis-ladder.vercel.app/torneo/inscripcion${menor ? '/infantil' : ''}" style="display: inline-block; background: #1c7ec4; color: #fff; text-decoration: none; font-weight: bold; padding: 10px 20px; border-radius: 6px;">Reportar el pago</a></p>
        `,
      })
      enviados.push(etiqueta)
    }

    return NextResponse.json({ ok: true, enviados, omitidos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al enviar los recordatorios' }, { status: 500 })
  }
}
