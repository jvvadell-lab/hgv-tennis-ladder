// Torneos internos — helpers de servidor (reciben el cliente de Supabase con
// service role de la ruta que los llama). La lógica pura está en
// lib/torneo.ts y lib/torneoInscripcion.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarCorreo } from '@/lib/email'
import type { EstadoInscripcion, Nivel, Torneo } from '@/lib/torneo'
import { estadoInscripcionCalculado, pendientesInscripcion, type Pendiente } from '@/lib/torneoInscripcion'

// El torneo que se está organizando o jugando: el más próximo que no esté
// finalizado. null si no hay ninguno.
export async function torneoVigente(db: SupabaseClient): Promise<Torneo | null> {
  const { data, error } = await db
    .from('torneos')
    .select('*')
    .neq('estado', 'finalizado')
    .order('fecha_inicio', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as Torneo | null
}

export type ResultadoRecalculo = {
  inscripcionId: string
  categoriaNombre: string
  torneoNombre: string
  jugadorIds: string[]
  antes: EstadoInscripcion
  despues: EstadoInscripcion
  pendientes: Pendiente[]
}

// Recalcula y guarda el estado de una inscripción (pendiente_pago ↔
// confirmada) según sus pagos y la categoría oficial de sus jugadores. Se
// llama después de validar o rechazar un pago y de asignar una categoría.
export async function recalcularInscripcion(db: SupabaseClient, inscripcionId: string): Promise<ResultadoRecalculo> {
  const { data: ins, error } = await db
    .from('torneo_inscripciones')
    .select('id, estado, jugador1_id, jugador2_id, torneo_categorias:categoria_id(nombre, categoria_nivel, torneos:torneo_id(nombre))')
    .eq('id', inscripcionId)
    .single()
  if (error) throw error

  const categoria = ins.torneo_categorias as unknown as { nombre: string; categoria_nivel: Nivel | null; torneos: { nombre: string } }
  const jugadorIds = [ins.jugador1_id, ins.jugador2_id].filter(Boolean) as string[]

  const [{ data: jugadores, error: errJ }, { data: pagos, error: errP }] = await Promise.all([
    db.from('jugadores').select('id, categoria_torneo').in('id', jugadorIds),
    db.from('pagos').select('jugador_id, validado').eq('torneo_inscripcion_id', inscripcionId),
  ])
  if (errJ) throw errJ
  if (errP) throw errP

  const datos = {
    estado: ins.estado as EstadoInscripcion,
    nivelCategoria: categoria.categoria_nivel,
    jugadores: jugadores || [],
    pagos: (pagos || []).map((p) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
  }
  const despues = estadoInscripcionCalculado(datos)
  if (despues !== ins.estado) {
    const { error: errUpd } = await db.from('torneo_inscripciones').update({ estado: despues }).eq('id', inscripcionId)
    if (errUpd) throw errUpd
  }
  return {
    inscripcionId,
    categoriaNombre: categoria.nombre,
    torneoNombre: categoria.torneos.nombre,
    jugadorIds,
    antes: ins.estado as EstadoInscripcion,
    despues,
    pendientes: pendientesInscripcion(datos),
  }
}

// --- Notificaciones (campana + correo) ---

// Correo con el mismo formato que el resto de los avisos del club. `cuerpo`
// es HTML ya escapado por quien llama (solo nombres de la base y textos fijos).
export function correoTorneo(nombre: string, cuerpo: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 28px; margin: 0 0 10px 0;">🎄🎾</p>
      <p>Hola ${escaparHtml(nombre)},</p>
      ${cuerpo}
      <p style="margin-top: 24px;">Puedes ver el estado de tu inscripción en la app, en <strong>Torneo Navidad</strong>.</p>
      <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
    </div>
  `
}

export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Avisa a cada jugador por la campana y por correo. Es informativo: si algo
// falla se registra y no se revierte la operación que lo originó.
export async function notificarJugadores(
  db: SupabaseClient,
  jugadorIds: string[],
  aviso: { tipo: string; mensaje: string; asunto: string; cuerpoHtml: (jugador: { id: string; nombre: string }) => string }
): Promise<void> {
  if (!jugadorIds.length) return
  try {
    const { error } = await db.from('notificaciones').insert(
      jugadorIds.map((id) => ({ jugador_id: id, tipo: aviso.tipo, mensaje: aviso.mensaje }))
    )
    if (error) throw error
  } catch (err: any) {
    console.error(`[torneo] No se pudo crear la notificación ${aviso.tipo}:`, err.message)
  }

  const { data: jugadores, error } = await db.from('jugadores').select('id, nombre, email').in('id', jugadorIds)
  if (error) {
    console.error('[torneo] No se pudieron leer los correos:', error.message)
    return
  }
  await Promise.all(
    (jugadores || []).filter((j) => j.email).map((j) =>
      enviarCorreo(j.email, aviso.asunto, correoTorneo(j.nombre || '', aviso.cuerpoHtml({ id: j.id, nombre: j.nombre || '' }))).catch((err) =>
        console.error(`[torneo] Falló el correo ${aviso.tipo} a ${j.email}:`, err.message)
      )
    )
  )
}

// Aviso de inscripción confirmada a los jugadores de la inscripción.
export async function avisarInscripcionConfirmada(db: SupabaseClient, r: ResultadoRecalculo) {
  const torneoNombre = r.torneoNombre
  await notificarJugadores(db, r.jugadorIds, {
    tipo: 'torneo_inscripcion_confirmada',
    mensaje: `✅ Tu inscripción en ${r.categoriaNombre} (${torneoNombre}) está confirmada.`,
    asunto: `✅ Inscripción confirmada — ${torneoNombre}`,
    cuerpoHtml: () => `
      <p>Tu inscripción en <strong>${escaparHtml(r.categoriaNombre)}</strong> del <strong>${escaparHtml(torneoNombre)}</strong> quedó <strong>confirmada</strong>: los pagos están validados y la categoría verificada.</p>
      <p>Te avisaremos cuando se haga el sorteo de los grupos.</p>
    `,
  })
}
