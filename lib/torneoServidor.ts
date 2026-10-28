// Torneos internos — helpers de servidor (reciben el cliente de Supabase con
// service role de la ruta que los llama). La lógica pura está en
// lib/torneo.ts y lib/torneoInscripcion.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarCorreo } from '@/lib/email'
import type { EstadoInscripcion, Nivel, Torneo } from '@/lib/torneo'
import { estadoInscripcionCalculado, pendientesInscripcion, type Pendiente } from '@/lib/torneoInscripcion'
import { estadoInscripcionMenorCalculado, pendientesInscripcionMenor } from '@/lib/torneoInfantil'
import type { MontoInscripcion } from '@/lib/torneoPrecios'

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

// Monto y motivo que le tocaría a una inscripción nueva (vista previa antes
// de confirmar). Es la misma función que usa el trigger que lo fija al crearla.
export async function montoProximaInscripcion(
  db: SupabaseClient,
  categoriaId: string,
  quien: { jugadorId: string } | { menorId: string },
): Promise<MontoInscripcion> {
  const { data, error } = await db.rpc('torneo_monto_inscripcion', {
    p_categoria: categoriaId,
    p_jugador: 'jugadorId' in quien ? quien.jugadorId : null,
    p_menor: 'menorId' in quien ? quien.menorId : null,
  })
  if (error) throw error
  const fila = (data as { monto_eur: number | string; motivo: string }[])[0]
  return { monto_eur: Number(fila.monto_eur), motivo: fila.motivo }
}

export type ResultadoRecalculo = {
  inscripcionId: string
  categoriaNombre: string
  torneoNombre: string
  jugadorIds: string[]
  antes: EstadoInscripcion
  despues: EstadoInscripcion
  pendientes: Pendiente[]
  // Inscripción infantil: el menor y su representante (jugadorIds = [representante con cuenta]).
  menor: MenorConRepresentante | null
}

export type MenorConRepresentante = {
  id: string
  nombre: string
  apellido: string
  representante_jugador_id: string
}

// Recalcula y guarda el estado de una inscripción (pendiente_pago ↔
// confirmada) según sus pagos y la categoría oficial de sus jugadores. Se
// llama después de validar o rechazar un pago y de asignar una categoría.
export async function recalcularInscripcion(db: SupabaseClient, inscripcionId: string): Promise<ResultadoRecalculo> {
  const { data: ins, error } = await db
    .from('torneo_inscripciones')
    .select('id, estado, jugador1_id, jugador2_id, menor_id, categoria_certificada_at, invitado_autorizado_at, torneo_categorias:categoria_id(nombre, categoria_nivel, torneos:torneo_id(nombre, solo_socios))')
    .eq('id', inscripcionId)
    .single()
  if (error) throw error

  const categoria = ins.torneo_categorias as unknown as { nombre: string; categoria_nivel: Nivel | null; torneos: { nombre: string; solo_socios: boolean } }
  if (ins.menor_id) return recalcularInscripcionMenor(db, ins, categoria)
  const jugadorIds = [ins.jugador1_id, ins.jugador2_id].filter(Boolean) as string[]

  const [{ data: jugadores, error: errJ }, { data: pagos, error: errP }] = await Promise.all([
    db.from('jugadores').select('id, categoria_torneo, es_invitado').in('id', jugadorIds),
    db.from('pagos').select('jugador_id, validado').eq('torneo_inscripcion_id', inscripcionId),
  ])
  if (errJ) throw errJ
  if (errP) throw errP

  const datos = {
    estado: ins.estado as EstadoInscripcion,
    nivelCategoria: categoria.categoria_nivel,
    jugadores: (jugadores || []).map((j) => ({ id: j.id, categoria_torneo: j.categoria_torneo, es_invitado: !!j.es_invitado })),
    pagos: (pagos || []).map((p) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
    soloSocios: !!categoria.torneos.solo_socios,
    invitadoAutorizado: !!ins.invitado_autorizado_at,
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
    menor: null,
  }
}

// Inscripción infantil: confirmada con el pago del representante validado
// y la categoría certificada por el admin (SPEC §14.2).
async function recalcularInscripcionMenor(
  db: SupabaseClient,
  ins: { id: string; estado: string; menor_id: string; categoria_certificada_at: string | null; invitado_autorizado_at: string | null },
  categoria: { nombre: string; torneos: { nombre: string; solo_socios: boolean } }
): Promise<ResultadoRecalculo> {
  const [{ data: menor, error: errM }, { data: pagos, error: errP }] = await Promise.all([
    db.from('torneo_menores').select('id, nombre, apellido, representante_jugador_id, numero_accion').eq('id', ins.menor_id).single(),
    db.from('pagos').select('jugador_id, validado').eq('torneo_inscripcion_id', ins.id),
  ])
  if (errM) throw errM
  if (errP) throw errP

  const datos = {
    estado: ins.estado as EstadoInscripcion,
    menorId: menor.id,
    representanteJugadorId: menor.representante_jugador_id,
    certificada: !!ins.categoria_certificada_at,
    pagos: (pagos || []).map((p) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
    soloSocios: !!categoria.torneos.solo_socios,
    menorConAccion: !!menor.numero_accion?.trim(),
    invitadoAutorizado: !!ins.invitado_autorizado_at,
  }
  const despues = estadoInscripcionMenorCalculado(datos)
  if (despues !== ins.estado) {
    const { error: errUpd } = await db.from('torneo_inscripciones').update({ estado: despues }).eq('id', ins.id)
    if (errUpd) throw errUpd
  }
  return {
    inscripcionId: ins.id,
    categoriaNombre: categoria.nombre,
    torneoNombre: categoria.torneos.nombre,
    jugadorIds: [menor.representante_jugador_id],
    antes: ins.estado as EstadoInscripcion,
    despues,
    pendientes: pendientesInscripcionMenor(datos),
    menor: { id: menor.id, nombre: menor.nombre, apellido: menor.apellido, representante_jugador_id: menor.representante_jugador_id },
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
  aviso: {
    tipo: string; mensaje: string; asunto: string; cuerpoHtml: (jugador: { id: string; nombre: string }) => string
    // Invitación a formar dupla: la campana muestra Aceptar / Rechazar.
    torneoInvitacionId?: string
  }
): Promise<void> {
  if (!jugadorIds.length) return
  try {
    const { error } = await db.from('notificaciones').insert(
      jugadorIds.map((id) => ({
        jugador_id: id, tipo: aviso.tipo, mensaje: aviso.mensaje,
        ...(aviso.torneoInvitacionId ? { torneo_invitacion_id: aviso.torneoInvitacionId } : {}),
      }))
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

// Avisa al representante de un menor (campana + correo). Informativo, como notificarJugadores.
export async function notificarRepresentante(
  db: SupabaseClient,
  menor: MenorConRepresentante,
  aviso: { tipo: string; mensaje: string; asunto: string; cuerpoHtml: string }
): Promise<void> {
  await notificarJugadores(db, [menor.representante_jugador_id], { ...aviso, cuerpoHtml: () => aviso.cuerpoHtml })
}

// Aviso de inscripción confirmada a los jugadores de la inscripción (o al
// representante, si es de un menor).
export async function avisarInscripcionConfirmada(db: SupabaseClient, r: ResultadoRecalculo) {
  const torneoNombre = r.torneoNombre
  if (r.menor) {
    await notificarRepresentante(db, r.menor, {
      tipo: 'torneo_inscripcion_confirmada',
      mensaje: `✅ La inscripción de ${r.menor.nombre} en ${r.categoriaNombre} (${torneoNombre}) está confirmada.`,
      asunto: `✅ Inscripción confirmada — ${torneoNombre}`,
      cuerpoHtml: `
        <p>La inscripción de <strong>${escaparHtml(r.menor.nombre)} ${escaparHtml(r.menor.apellido)}</strong> en <strong>${escaparHtml(r.categoriaNombre)}</strong> del <strong>${escaparHtml(torneoNombre)}</strong> quedó <strong>confirmada</strong>: el pago está validado y la categoría certificada.</p>
        <p>Te avisaremos cuando se haga el sorteo de los grupos.</p>
      `,
    })
    return
  }
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
