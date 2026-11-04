// Dobles con inscripción individual — helpers de servidor (reciben el
// cliente de Supabase con service role). Invitaciones a formar dupla
// (enviar, aceptar, rechazar, cancelar, vencer), vínculo de las invitaciones
// por teléfono al registrarse y duplas armadas por el admin. La lógica pura
// está en lib/torneoDobles.ts. torneo_invitaciones no se lee nunca con la
// clave anónima (tiene teléfonos).

import type { SupabaseClient } from '@supabase/supabase-js'
import { ahora } from '@/lib/tiempo'
import type { Torneo, TorneoCategoria } from '@/lib/torneo'
import { candidatosArmarAdmin, errorDupla, normalizarTelefonoVe, porAprobar, requiereAprobacionInvitacion, telefonoLegible, venceInvitacion, type CandidatoAdmin, type EstadoEnDobles, type JugadorDobles } from '@/lib/torneoDobles'
import { categoriaAbierta, mensajeErrorBaseInscripcion } from '@/lib/torneoInscripcion'
import { avisarInscripcionConfirmada, escaparHtml, notificarJugadores, recalcularInscripcion } from '@/lib/torneoServidor'
import { textoMontoCorto } from '@/lib/torneoPrecios'

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export const COLUMNAS_INVITACION = 'id, categoria_id, invita_inscripcion_id, invitado_jugador_id, invitado_nombre, invitado_telefono, estado, vence_at, respondida_at, motivo, equipo_id, created_at, requiere_aprobacion, aprobada_por, aprobada_at'

export type Invitacion = {
  id: string
  categoria_id: string
  invita_inscripcion_id: string
  invitado_jugador_id: string | null
  invitado_nombre: string | null
  invitado_telefono: string | null
  estado: 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada' | 'vencida'
  vence_at: string
  respondida_at: string | null
  motivo: string | null
  equipo_id: string | null
  created_at: string
  requiere_aprobacion: boolean   // a un no socio en una categoría con aprobación previa del admin
  aprobada_por: string | null
  aprobada_at: string | null
}

export { porAprobar }

type CategoriaInv = Pick<TorneoCategoria, 'id' | 'nombre' | 'modalidad' | 'genero' | 'categoria_nivel' | 'cupo' | 'inscripciones_abiertas'> & { torneo_id: string; sorteo_publicado_at: string | null; cancelada_at: string | null; invitar_no_socios_con_aprobacion: boolean }
const COLUMNAS_CATEGORIA = 'id, torneo_id, nombre, modalidad, genero, categoria_nivel, cupo, inscripciones_abiertas, sorteo_publicado_at, cancelada_at, invitar_no_socios_con_aprobacion'
const COLUMNAS_JUGADOR = 'id, nombre, genero, categoria, categoria_torneo, telefono, activo, estado_verificacion, email_verificado, es_invitado'

type JugadorInv = JugadorDobles & { telefono: string | null; activo: boolean; estado_verificacion: string; email_verificado: boolean; es_invitado: boolean | null }

const cierreDe = (t: Pick<Torneo, 'cierre_inscripciones_at'>) => (t.cierre_inscripciones_at ? new Date(t.cierre_inscripciones_at) : null)

async function leerCategoria(db: SupabaseClient, id: string): Promise<CategoriaInv | null> {
  const { data, error } = await db.from('torneo_categorias').select(COLUMNAS_CATEGORIA).eq('id', id).maybeSingle()
  if (error) throw error
  return data as CategoriaInv | null
}

async function leerJugadores(db: SupabaseClient, ids: string[]): Promise<Map<string, JugadorInv>> {
  const { data, error } = ids.length ? await db.from('jugadores').select(COLUMNAS_JUGADOR).in('id', ids) : { data: [], error: null }
  if (error) throw error
  return new Map((data || []).map((j: any) => [j.id, { ...j, email_verificado: !!j.email_verificado } as JugadorInv]))
}

const puedeJugar = (j: JugadorInv) => j.activo && j.estado_verificacion !== 'no_permitido'

// Inscripción viva de un jugador en una categoría (null si no está inscrito).
async function inscripcionDe(db: SupabaseClient, categoriaId: string, jugadorId: string) {
  const { data, error } = await db
    .from('torneo_inscripciones')
    .select('id, categoria_id, jugador1_id, estado')
    .eq('categoria_id', categoriaId)
    .eq('jugador1_id', jugadorId)
    .neq('estado', 'retirada')
    .maybeSingle()
  if (error) throw error
  return data
}

async function enDupla(db: SupabaseClient, inscripcionId: string): Promise<boolean> {
  const { data, error } = await db
    .from('torneo_equipos')
    .select('id')
    .eq('estado', 'activo')
    .or(`inscripcion1_id.eq.${inscripcionId},inscripcion2_id.eq.${inscripcionId}`)
    .limit(1)
  if (error) throw error
  return (data || []).length > 0
}

// Quién invitó (jugador) de cada invitación.
async function invitadorDe(db: SupabaseClient, inscripcionIds: string[]): Promise<Map<string, string>> {
  const { data, error } = inscripcionIds.length
    ? await db.from('torneo_inscripciones').select('id, jugador1_id').in('id', inscripcionIds)
    : { data: [], error: null }
  if (error) throw error
  return new Map((data || []).map((i: any) => [i.id, i.jugador1_id]))
}

// ---------------------------------------------------------------------------
// Vencimiento (al leer o actuar, sin cron)
// ---------------------------------------------------------------------------

// Pasa a 'vencida' las pendientes cuyo plazo ya pasó (de unas categorías) y
// avisa a los dos. Devuelve cuántas venció.
export async function vencerInvitaciones(db: SupabaseClient, categoriaIds: string[]): Promise<number> {
  if (!categoriaIds.length) return 0
  const { data, error } = await db
    .from('torneo_invitaciones')
    .update({ estado: 'vencida', respondida_at: ahora().toISOString(), motivo: 'Venció sin respuesta' })
    .in('categoria_id', categoriaIds)
    .eq('estado', 'pendiente')
    .lte('vence_at', ahora().toISOString())
    .select(COLUMNAS_INVITACION)
  if (error) throw error
  const vencidas = (data || []) as Invitacion[]
  if (vencidas.length) await avisarFinInvitaciones(db, vencidas, 'vencida')
  return vencidas.length
}

// Aviso a los dos cuando una invitación se rechaza, vence o se cancela: el
// que invitó vuelve a estar disponible.
async function avisarFinInvitaciones(db: SupabaseClient, invitaciones: Invitacion[], como: 'vencida' | 'rechazada' | 'cancelada') {
  try {
    const invitador = await invitadorDe(db, invitaciones.map((i) => i.invita_inscripcion_id))
    const ids = [...new Set(invitaciones.flatMap((i) => [invitador.get(i.invita_inscripcion_id), i.invitado_jugador_id]).filter(Boolean))] as string[]
    const jugadores = await leerJugadores(db, ids)
    const { data: cats } = await db.from('torneo_categorias').select('id, nombre').in('id', [...new Set(invitaciones.map((i) => i.categoria_id))])
    const catNombre = new Map((cats || []).map((c: any) => [c.id, c.nombre as string]))
    const verbo = { vencida: 'venció', rechazada: 'fue rechazada', cancelada: 'se canceló' }[como]
    for (const inv of invitaciones) {
      const deId = invitador.get(inv.invita_inscripcion_id)
      const de = deId ? jugadores.get(deId)?.nombre ?? '—' : '—'
      const para = inv.invitado_jugador_id ? jugadores.get(inv.invitado_jugador_id)?.nombre ?? inv.invitado_nombre ?? '—' : inv.invitado_nombre ?? '—'
      const cat = catNombre.get(inv.categoria_id) ?? ''
      const motivo = inv.motivo && como !== 'rechazada' ? ` (${inv.motivo})` : ''
      if (deId) {
        await notificarJugadores(db, [deId], {
          tipo: `torneo_invitacion_${como}`,
          mensaje: `🎾 Tu invitación a ${para} para ${cat} ${verbo}${motivo}. Sigues inscrito y disponible: puedes invitar a otra pareja.`,
          asunto: `Invitación ${como} — ${cat}`,
          cuerpoHtml: () => `<p>Tu invitación a <strong>${escaparHtml(para)}</strong> para formar dupla en <strong>${escaparHtml(cat)}</strong> ${verbo}${escaparHtml(motivo)}.</p><p>Sigues inscrito y <strong>disponible</strong>: puedes invitar a otra pareja o esperar a que el admin arme las duplas al cierre.</p>`,
        })
      }
      // Al invitado solo si llegó a verla (las por aprobar nunca le llegaron).
      if (inv.invitado_jugador_id && como !== 'rechazada' && !porAprobar(inv)) {
        await notificarJugadores(db, [inv.invitado_jugador_id], {
          tipo: `torneo_invitacion_${como}`,
          mensaje: `🎾 La invitación de ${de} para ${cat} ${verbo}${motivo}.`,
          asunto: `Invitación ${como} — ${cat}`,
          cuerpoHtml: () => `<p>La invitación de <strong>${escaparHtml(de)}</strong> para formar dupla en <strong>${escaparHtml(cat)}</strong> ${verbo}${escaparHtml(motivo)}.</p>`,
        })
      }
    }
  } catch (err: any) {
    console.error('[torneo] No se pudo avisar el fin de la invitación:', err.message)
  }
}

// ---------------------------------------------------------------------------
// Enviar
// ---------------------------------------------------------------------------

export type DestinoInvitacion = { jugadorId: string } | { nombre: string; telefono: string }

// Invitación de `invitaId` (inscrito en la categoría y disponible) a un
// jugador de la app o a un teléfono. Una sola pendiente por jugador y
// categoría. Si el teléfono ya es de un jugador registrado, se le asigna.
export async function enviarInvitacion(
  db: SupabaseClient,
  torneo: Torneo,
  categoriaId: string,
  invitaId: string,
  destino: DestinoInvitacion,
): Promise<Resultado<{ invitacion: Invitacion; whatsapp: { telefono: string; nombre: string } | null; porAprobar: boolean }>> {
  const categoria = await leerCategoria(db, categoriaId)
  if (!categoria || categoria.torneo_id !== torneo.id || categoria.modalidad !== 'doble') return { ok: false, error: 'Esa categoría no es de dobles de este torneo' }
  if (!categoriaAbierta(torneo.estado, categoria) || categoria.sorteo_publicado_at || categoria.cancelada_at) {
    return { ok: false, error: 'Las inscripciones de esta categoría no están abiertas' }
  }

  await vencerInvitaciones(db, [categoriaId])
  const mia = await inscripcionDe(db, categoriaId, invitaId)
  if (!mia) return { ok: false, error: 'Primero inscríbete en la categoría' }
  if (await enDupla(db, mia.id)) return { ok: false, error: 'Ya tienes dupla en esta categoría' }

  let invitadoId: string | null = null
  let nombre: string | null = null
  let telefono: string | null = null
  if ('jugadorId' in destino) {
    invitadoId = destino.jugadorId
  } else {
    nombre = String(destino.nombre ?? '').trim().slice(0, 80)
    if (!nombre) return { ok: false, error: 'Escribe el nombre de tu pareja' }
    telefono = normalizarTelefonoVe(destino.telefono)
    if (!telefono) return { ok: false, error: 'El teléfono no es un número de Venezuela válido (ej. 0414-1234567)' }
    // ¿Ya está registrado con ese teléfono? Entonces la invitación es a su cuenta.
    const registrado = await jugadorPorTelefono(db, telefono)
    if (registrado) invitadoId = registrado
  }

  const jugadores = await leerJugadores(db, [invitaId, ...(invitadoId ? [invitadoId] : [])])
  const yo = jugadores.get(invitaId)!
  if (invitadoId) {
    const pareja = jugadores.get(invitadoId)
    if (!pareja) return { ok: false, error: 'No encontramos a ese jugador' }
    if (!puedeJugar(pareja)) return { ok: false, error: `${pareja.nombre} no está activo en el club` }
    const err = errorDupla(categoria, yo, pareja)
    if (err) return { ok: false, error: err }
    const suya = await inscripcionDe(db, categoriaId, invitadoId)
    if (suya && (await enDupla(db, suya.id))) return { ok: false, error: `${pareja.nombre} ya tiene dupla en esta categoría` }
    if (suya) {
      const { data: susEnviadas } = await db.from('torneo_invitaciones').select('id').eq('invita_inscripcion_id', suya.id).eq('estado', 'pendiente').limit(1)
      if ((susEnviadas || []).length) return { ok: false, error: `${pareja.nombre} está esperando la respuesta de otra invitación` }
    }
    nombre = nombre ?? pareja.nombre
  }

  // Aprobación previa: a un no socio (o a un teléfono sin cuenta, que todavía
  // no sabemos si es socio) en una categoría que la exige.
  const requiereAprobacion = requiereAprobacionInvitacion(categoria, invitadoId ? jugadores.get(invitadoId) ?? null : null)

  const momento = ahora()
  // Por aprobar no corre el plazo de 48 h: vence al cierre (o se aprueba antes).
  const cierre = cierreDe(torneo)
  const vence = requiereAprobacion
    ? (cierre && cierre > momento ? cierre : new Date(momento.getTime() + 14 * 24 * 3600 * 1000))
    : venceInvitacion(momento, cierre)
  const { data, error } = await db
    .from('torneo_invitaciones')
    .insert({
      categoria_id: categoriaId,
      invita_inscripcion_id: mia.id,
      invitado_jugador_id: invitadoId,
      invitado_nombre: nombre,
      invitado_telefono: telefono,
      vence_at: vence.toISOString(),
      requiere_aprobacion: requiereAprobacion,
    })
    .select(COLUMNAS_INVITACION)
    .single()
  if (error) {
    if (error.message.includes('torneo_invitaciones_una_pendiente')) return { ok: false, error: 'Ya tienes una invitación pendiente en esta categoría: cancélala para invitar a otra persona' }
    throw error
  }
  const inv = data as Invitacion
  if (requiereAprobacion) return { ok: true, invitacion: inv, whatsapp: null, porAprobar: true }
  if (invitadoId) await avisarInvitacionNueva(db, inv, yo.nombre, categoria.nombre, torneo.nombre)
  return { ok: true, invitacion: inv, whatsapp: telefono ? { telefono, nombre: nombre! } : null, porAprobar: false }
}

async function avisarInvitacionNueva(db: SupabaseClient, inv: Invitacion, deNombre: string, categoriaNombre: string, torneoNombre: string) {
  await notificarJugadores(db, [inv.invitado_jugador_id!], {
    tipo: 'torneo_invitacion',
    mensaje: `🎾 ${deNombre} te invita a ser su pareja en ${categoriaNombre} (${torneoNombre}). Acepta o rechaza antes de que venza.`,
    asunto: `🎾 ${deNombre} te invita a jugar ${categoriaNombre}`,
    torneoInvitacionId: inv.id,
    cuerpoHtml: () => `
      <p><strong>${escaparHtml(deNombre)}</strong> te invita a ser su pareja en <strong>${escaparHtml(categoriaNombre)}</strong> del <strong>${escaparHtml(torneoNombre)}</strong>.</p>
      <p>Entra a la app (campana o <strong>Torneo → Inscribirme</strong>) para <strong>aceptar o rechazar</strong>. Si no estás inscrito en la categoría, al aceptar quedas inscrito y te falta reportar tu pago.</p>
    `,
  })
}

// ---------------------------------------------------------------------------
// Teléfonos: invitaciones a alguien que todavía no tenía cuenta
// ---------------------------------------------------------------------------

async function jugadorPorTelefono(db: SupabaseClient, telefono58: string): Promise<string | null> {
  // jugadores.telefono se guarda como "+58 414-1234567": se compara normalizado.
  const local = telefono58.slice(2)
  const { data, error } = await db.from('jugadores').select('id, telefono').ilike('telefono', `%${local.slice(-7)}%`)
  if (error) throw error
  const encontrado = (data || []).find((j: any) => normalizarTelefonoVe(j.telefono) === telefono58)
  return encontrado?.id ?? null
}

// Asigna al jugador las invitaciones pendientes hechas a su teléfono (al
// registrarse, o al abrir su pantalla si cambió el teléfono) y le avisa.
export async function vincularInvitacionesPorTelefono(db: SupabaseClient, jugadorId: string, telefono: string | null): Promise<number> {
  const t = normalizarTelefonoVe(telefono)
  if (!t) return 0
  const { data, error } = await db
    .from('torneo_invitaciones')
    .update({ invitado_jugador_id: jugadorId })
    .eq('invitado_telefono', t)
    .is('invitado_jugador_id', null)
    .eq('estado', 'pendiente')
    .gt('vence_at', ahora().toISOString())
    .select(COLUMNAS_INVITACION)
  if (error) throw error
  const lista = ((data || []) as Invitacion[]).filter((i) => !porAprobar(i))
  if (lista.length) {
    const invitador = await invitadorDe(db, lista.map((i) => i.invita_inscripcion_id))
    const jugadores = await leerJugadores(db, [...invitador.values()])
    const { data: cats } = await db.from('torneo_categorias').select('id, nombre, torneos:torneo_id(nombre)').in('id', lista.map((i) => i.categoria_id))
    for (const inv of lista) {
      const c: any = (cats || []).find((x: any) => x.id === inv.categoria_id)
      await avisarInvitacionNueva(db, inv, jugadores.get(invitador.get(inv.invita_inscripcion_id)!)?.nombre ?? '—', c?.nombre ?? '', c?.torneos?.nombre ?? '')
    }
  }
  return lista.length
}

// ---------------------------------------------------------------------------
// Responder (el invitado) y cancelar (quien invitó)
// ---------------------------------------------------------------------------

export async function aceptarInvitacion(db: SupabaseClient, torneo: Torneo, invitacionId: string, jugadorId: string): Promise<Resultado<{ inscripcionNueva: boolean; inscripcionId: string }>> {
  const { data: inv0, error } = await db.from('torneo_invitaciones').select(COLUMNAS_INVITACION).eq('id', invitacionId).maybeSingle()
  if (error) throw error
  const inv = inv0 as Invitacion | null
  if (!inv || inv.invitado_jugador_id !== jugadorId) return { ok: false, error: 'Esta invitación no es para ti' }
  if (inv.estado !== 'pendiente') return { ok: false, error: 'Esta invitación ya no está pendiente' }
  if (porAprobar(inv)) return { ok: false, error: 'Esta invitación todavía no la aprobó el admin' }

  const categoria = await leerCategoria(db, inv.categoria_id)
  const invitador = (await invitadorDe(db, [inv.invita_inscripcion_id])).get(inv.invita_inscripcion_id)
  const jugadores = await leerJugadores(db, [jugadorId, ...(invitador ? [invitador] : [])])
  const yo = jugadores.get(jugadorId)!
  const de = invitador ? jugadores.get(invitador) : undefined

  // Con el registro todavía inactivo la invitación sigue pendiente: puede
  // aceptarla cuando el admin lo active o verifique su correo.
  if (!puedeJugar(yo) || !yo.email_verificado) {
    return { ok: false, error: 'Tu registro todavía no está activo (correo sin verificar o cuenta inactiva): podrás aceptar cuando lo esté' }
  }
  // Lo que la base no revisa (nivel, apertura, cierre): si ya no se cumple,
  // la invitación queda vencida con el motivo y se avisa a los dos.
  let motivo: string | null = null
  if (!categoria || !de) motivo = 'Quien te invitó ya no está inscrito'
  else if (!categoriaAbierta(torneo.estado, categoria) || categoria.sorteo_publicado_at || categoria.cancelada_at) motivo = 'Ya cerraron las inscripciones de la categoría'
  else motivo = errorDupla(categoria, de, yo)
  if (motivo) {
    await terminar(db, [inv], 'vencida', motivo)
    return { ok: false, error: motivo }
  }

  const { data: r, error: errRpc } = await db.rpc('torneo_aceptar_invitacion', { p_invitacion_id: inv.id, p_jugador_id: jugadorId })
  if (errRpc) throw errRpc
  if (!r.ok) {
    const claro = mensajeErrorBaseInscripcion(r.error) ?? r.error
    if (r.vencida) await avisarFinInvitaciones(db, [{ ...inv, motivo: claro }], 'vencida')
    return { ok: false, error: claro }
  }

  // Invitación aprobada por el admin (a un no socio): esa aprobación es
  // también la autorización como invitado, en un solo paso.
  if (inv.requiere_aprobacion && inv.aprobada_at && inv.aprobada_por) {
    const { error: errAut } = await db
      .from('torneo_inscripciones')
      .update({ invitado_autorizado_por: inv.aprobada_por, invitado_autorizado_at: ahora().toISOString() })
      .eq('id', r.inscripcion_id)
      .is('invitado_autorizado_at', null)
    if (errAut) throw errAut
    const rec = await recalcularInscripcion(db, r.inscripcion_id)
    if (rec.antes !== 'confirmada' && rec.despues === 'confirmada') await avisarInscripcionConfirmada(db, rec)
  }

  // Las demás invitaciones de los dos en la categoría quedaron canceladas.
  if (r.canceladas?.length) {
    const { data: canceladas } = await db.from('torneo_invitaciones').select(COLUMNAS_INVITACION).in('id', r.canceladas)
    await avisarFinInvitaciones(db, (canceladas || []) as Invitacion[], 'cancelada')
  }
  let montoNueva = ''
  if (r.inscripcion_nueva) {
    const { data: nueva, error: errNueva } = await db.from('torneo_inscripciones').select('monto_eur, monto_motivo').eq('id', r.inscripcion_id).single()
    if (errNueva) throw errNueva
    montoNueva = textoMontoCorto({ monto_eur: Number(nueva.monto_eur), motivo: nueva.monto_motivo })
  }
  await notificarJugadores(db, [de!.id, yo.id], {
    tipo: 'torneo_dupla',
    mensaje: `🤝 ${de!.nombre} / ${yo.nombre}: dupla formada en ${categoria!.nombre}.${r.inscripcion_nueva ? ` ${yo.nombre}, falta reportar tu pago.` : ''}`,
    asunto: `🤝 Dupla formada — ${categoria!.nombre}`,
    cuerpoHtml: (j) => `
      <p>${j.id === yo.id ? `Aceptaste la invitación de <strong>${escaparHtml(de!.nombre)}</strong>` : `<strong>${escaparHtml(yo.nombre)}</strong> aceptó tu invitación`}: la dupla <strong>${escaparHtml(de!.nombre)} / ${escaparHtml(yo.nombre)}</strong> quedó formada en <strong>${escaparHtml(categoria!.nombre)}</strong>.</p>
      ${j.id === yo.id && r.inscripcion_nueva ? `<p>Quedaste inscrito en la categoría: falta reportar tu pago (${montoNueva} en Bs. a la tasa BCV del euro).</p>` : ''}
    `,
  })
  return { ok: true, inscripcionNueva: !!r.inscripcion_nueva, inscripcionId: r.inscripcion_id }
}

export async function rechazarInvitacion(db: SupabaseClient, invitacionId: string, jugadorId: string): Promise<Resultado> {
  const { data, error } = await db.from('torneo_invitaciones').select(COLUMNAS_INVITACION).eq('id', invitacionId).maybeSingle()
  if (error) throw error
  const inv = data as Invitacion | null
  if (!inv || inv.invitado_jugador_id !== jugadorId) return { ok: false, error: 'Esta invitación no es para ti' }
  if (inv.estado !== 'pendiente') return { ok: false, error: 'Esta invitación ya no está pendiente' }
  if (porAprobar(inv)) return { ok: false, error: 'Esta invitación todavía no la aprobó el admin' }
  await terminar(db, [inv], 'rechazada', null)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Aprobación previa del admin (invitaciones a no socios)
// ---------------------------------------------------------------------------

// El admin aprueba (o no) una invitación a un no socio. Al aprobarla empieza
// a correr su plazo normal (48 h o el cierre) y el invitado recibe el aviso;
// a quien invitó se le avisa para que mande el WhatsApp si no tiene cuenta.
// Si no la aprueba, queda rechazada y solo se le avisa a quien invitó.
export async function resolverAprobacionInvitacion(
  db: SupabaseClient,
  torneo: Torneo,
  invitacionId: string,
  aprobar: boolean,
  adminId: string,
): Promise<Resultado> {
  const { data, error } = await db.from('torneo_invitaciones').select(COLUMNAS_INVITACION).eq('id', invitacionId).maybeSingle()
  if (error) throw error
  const inv = data as Invitacion | null
  if (!inv) return { ok: false, error: 'Invitación no encontrada' }
  if (inv.estado !== 'pendiente' || !porAprobar(inv)) return { ok: false, error: 'Esta invitación ya no está por aprobar' }
  const categoria = await leerCategoria(db, inv.categoria_id)
  if (!categoria || categoria.torneo_id !== torneo.id) return { ok: false, error: 'Esa invitación no es de este torneo' }

  const deId = (await invitadorDe(db, [inv.invita_inscripcion_id])).get(inv.invita_inscripcion_id)
  const jugadores = await leerJugadores(db, [deId, inv.invitado_jugador_id].filter(Boolean) as string[])
  const de = deId ? jugadores.get(deId) : undefined
  const para = (inv.invitado_jugador_id && jugadores.get(inv.invitado_jugador_id)?.nombre) || inv.invitado_nombre || '—'
  const momento = ahora()

  if (!aprobar) {
    const { data: hecho, error: errU } = await db
      .from('torneo_invitaciones')
      .update({ estado: 'rechazada', respondida_at: momento.toISOString(), motivo: 'El admin no aprobó la invitación' })
      .eq('id', inv.id)
      .eq('estado', 'pendiente')
      .select('id')
    if (errU) throw errU
    if (!(hecho || []).length) return { ok: false, error: 'Esta invitación ya no está por aprobar' }
    if (de) {
      await notificarJugadores(db, [de.id], {
        tipo: 'torneo_invitacion_no_aprobada',
        mensaje: `🎾 El admin no aprobó tu invitación a ${para} para ${categoria.nombre}. Sigues inscrito y disponible: puedes invitar a otra pareja.`,
        asunto: `Invitación no aprobada — ${categoria.nombre}`,
        cuerpoHtml: () => `<p>El admin no aprobó tu invitación a <strong>${escaparHtml(para)}</strong> para formar dupla en <strong>${escaparHtml(categoria.nombre)}</strong>.</p><p>Sigues inscrito y <strong>disponible</strong>: puedes invitar a otra pareja.</p>`,
      })
    }
    return { ok: true }
  }

  if (!categoriaAbierta(torneo.estado, categoria) || categoria.sorteo_publicado_at || categoria.cancelada_at) {
    return { ok: false, error: 'Las inscripciones de esta categoría ya no están abiertas' }
  }
  const { data: hecho, error: errU } = await db
    .from('torneo_invitaciones')
    .update({ aprobada_por: adminId, aprobada_at: momento.toISOString(), vence_at: venceInvitacion(momento, cierreDe(torneo)).toISOString() })
    .eq('id', inv.id)
    .eq('estado', 'pendiente')
    .is('aprobada_at', null)
    .select(COLUMNAS_INVITACION)
  if (errU) throw errU
  const aprobada = ((hecho || []) as Invitacion[])[0]
  if (!aprobada) return { ok: false, error: 'Esta invitación ya no está por aprobar' }

  if (aprobada.invitado_jugador_id) await avisarInvitacionNueva(db, aprobada, de?.nombre ?? '—', categoria.nombre, torneo.nombre)
  if (de) {
    const sinCuenta = !aprobada.invitado_jugador_id
    await notificarJugadores(db, [de.id], {
      tipo: 'torneo_invitacion_aprobada',
      mensaje: sinCuenta
        ? `✅ El admin aprobó tu invitación a ${para} para ${categoria.nombre}. Envíale el WhatsApp desde Torneo → Inscribirme.`
        : `✅ El admin aprobó tu invitación a ${para} para ${categoria.nombre}. Ya le llegó: falta que la acepte.`,
      asunto: `Invitación aprobada — ${categoria.nombre}`,
      cuerpoHtml: () => sinCuenta
        ? `<p>El admin aprobó tu invitación a <strong>${escaparHtml(para)}</strong> para <strong>${escaparHtml(categoria.nombre)}</strong>.</p><p>Entra a <strong>Torneo → Inscribirme</strong> y toca <strong>Abrir WhatsApp</strong> para enviarle la invitación.</p>`
        : `<p>El admin aprobó tu invitación a <strong>${escaparHtml(para)}</strong> para <strong>${escaparHtml(categoria.nombre)}</strong>. Ya le llegó el aviso: falta que la acepte.</p>`,
    })
  }
  return { ok: true }
}

export async function cancelarInvitacion(db: SupabaseClient, invitacionId: string, jugadorId: string): Promise<Resultado> {
  const { data, error } = await db.from('torneo_invitaciones').select(COLUMNAS_INVITACION).eq('id', invitacionId).maybeSingle()
  if (error) throw error
  const inv = data as Invitacion | null
  const invitador = inv ? (await invitadorDe(db, [inv.invita_inscripcion_id])).get(inv.invita_inscripcion_id) : null
  if (!inv || invitador !== jugadorId) return { ok: false, error: 'Esta invitación no es tuya' }
  if (inv.estado !== 'pendiente') return { ok: false, error: 'Esta invitación ya no está pendiente' }
  await terminar(db, [inv], 'cancelada', 'La canceló quien invitó')
  return { ok: true }
}

// Cierra invitaciones pendientes (solo las que siguen pendientes) y avisa.
async function terminar(db: SupabaseClient, lista: Invitacion[], estado: 'vencida' | 'rechazada' | 'cancelada', motivo: string | null) {
  if (!lista.length) return
  const { data, error } = await db
    .from('torneo_invitaciones')
    .update({ estado, respondida_at: ahora().toISOString(), motivo })
    .in('id', lista.map((i) => i.id))
    .eq('estado', 'pendiente')
    .select(COLUMNAS_INVITACION)
  if (error) throw error
  await avisarFinInvitaciones(db, (data || []) as Invitacion[], estado)
}

// Al cerrar el admin una categoría: sus invitaciones pendientes vencen y se avisa.
export async function vencerInvitacionesDeCategoria(db: SupabaseClient, categoriaId: string, motivo: string): Promise<number> {
  const { data, error } = await db.from('torneo_invitaciones').select(COLUMNAS_INVITACION).eq('categoria_id', categoriaId).eq('estado', 'pendiente')
  if (error) throw error
  await terminar(db, (data || []) as Invitacion[], 'vencida', motivo)
  return (data || []).length
}

// Cancela las pendientes en que participa una inscripción (al retirarse,
// trasladarse o al armarle dupla el admin).
export async function cancelarInvitacionesDe(db: SupabaseClient, inscripcionIds: string[], motivo: string) {
  if (!inscripcionIds.length) return
  const { data: ins } = await db.from('torneo_inscripciones').select('id, categoria_id, jugador1_id').in('id', inscripcionIds)
  const lista: Invitacion[] = []
  for (const i of ins || []) {
    const { data, error } = await db
      .from('torneo_invitaciones')
      .select(COLUMNAS_INVITACION)
      .eq('estado', 'pendiente')
      .eq('categoria_id', i.categoria_id)
      .or(`invita_inscripcion_id.eq.${i.id}${i.jugador1_id ? `,invitado_jugador_id.eq.${i.jugador1_id}` : ''}`)
    if (error) throw error
    lista.push(...((data || []) as Invitacion[]))
  }
  const unicas = [...new Map(lista.map((i) => [i.id, i])).values()]
  await terminar(db, unicas, 'cancelada', motivo)
}

// ---------------------------------------------------------------------------
// Admin: armar y deshacer duplas
// ---------------------------------------------------------------------------

// Arma una dupla con dos inscritos disponibles de la categoría (al cierre o
// para cambiar la pareja de una dupla, antes del sorteo) y avisa a los dos.
export async function armarDuplaAdmin(db: SupabaseClient, torneo: Torneo, inscripcionIds: [string, string], adminId: string): Promise<Resultado<{ equipoId: string }>> {
  if (!['borrador', 'inscripcion'].includes(torneo.estado)) return { ok: false, error: 'El sorteo ya se hizo' }
  const { data: ins, error } = await db.from('torneo_inscripciones').select('id, categoria_id, jugador1_id, estado').in('id', inscripcionIds)
  if (error) throw error
  if ((ins || []).length !== 2 || ins![0].categoria_id !== ins![1].categoria_id) return { ok: false, error: 'Elige dos inscritos de la misma categoría' }
  if (ins!.some((i) => i.estado === 'retirada')) return { ok: false, error: 'Una de las inscripciones está retirada' }
  const categoria = await leerCategoria(db, ins![0].categoria_id)
  if (!categoria || categoria.modalidad !== 'doble') return { ok: false, error: 'La categoría no es de dobles' }
  if (categoria.sorteo_publicado_at) return { ok: false, error: `${categoria.nombre} ya se sorteó` }
  const jugadores = await leerJugadores(db, ins!.map((i) => i.jugador1_id))
  const [a, b] = inscripcionIds.map((id) => jugadores.get(ins!.find((i) => i.id === id)!.jugador1_id)!)
  const err = errorDupla(categoria, a, b)
  if (err) return { ok: false, error: err }

  const { data: equipo, error: errE } = await db
    .from('torneo_equipos')
    .insert({ categoria_id: categoria.id, inscripcion1_id: inscripcionIds[0], inscripcion2_id: inscripcionIds[1], origen: 'admin', formado_por_admin: adminId })
    .select('id')
    .single()
  if (errE) return { ok: false, error: mensajeErrorBaseInscripcion(errE.message) ?? errE.message }

  await cancelarInvitacionesDe(db, inscripcionIds, 'El admin armó la dupla')
  await notificarJugadores(db, [a.id, b.id], {
    tipo: 'torneo_dupla',
    mensaje: `🤝 El admin armó la dupla ${a.nombre} / ${b.nombre} en ${categoria.nombre}.`,
    asunto: `🤝 Tu dupla en ${categoria.nombre}`,
    cuerpoHtml: (j) => `<p>El admin armó tu dupla en <strong>${escaparHtml(categoria.nombre)}</strong>: juegas con <strong>${escaparHtml(j.id === a.id ? b.nombre : a.nombre)}</strong>.</p>`,
  })
  return { ok: true, equipoId: equipo.id }
}

// ---------------------------------------------------------------------------
// Admin: armar una dupla con cualquier jugador del club (2-nov-2026)
// ---------------------------------------------------------------------------
// El admin elige dos jugadores activos (inscritos o no en la categoría). Los
// que no estaban inscritos quedan inscritos "por el admin" (monto fijado por
// el trigger como siempre), se arma la dupla, se anulan sus invitaciones
// pendientes y, si alguno es invitado (no socio), armarla cuenta como la
// autorización del admin. A los jugadores solo les queda pagar. Antes del
// sorteo de la categoría; funciona aunque la categoría esté cerrada.

async function estadoDeCategoria(db: SupabaseClient, categoriaId: string) {
  const { data: ins, error } = await db.from('torneo_inscripciones').select('id, jugador1_id').eq('categoria_id', categoriaId).neq('estado', 'retirada').not('jugador1_id', 'is', null)
  if (error) throw error
  const { data: eq, error: errE } = await db.from('torneo_equipos').select('inscripcion1_id, inscripcion2_id').eq('categoria_id', categoriaId).eq('estado', 'activo')
  if (errE) throw errE
  const { data: inv, error: errI } = await db.from('torneo_invitaciones').select('invita_inscripcion_id').eq('categoria_id', categoriaId).eq('estado', 'pendiente')
  if (errI) throw errI
  const enDuplaIds = new Set((eq || []).flatMap((e: any) => [e.inscripcion1_id, e.inscripcion2_id]).filter(Boolean))
  const conInvitacion = new Set((inv || []).map((i: any) => i.invita_inscripcion_id))
  const estado = new Map<string, EstadoEnDobles>()
  const inscripcionDeJugador = new Map<string, string>()
  for (const i of ins || []) {
    inscripcionDeJugador.set(i.jugador1_id, i.id)
    estado.set(i.jugador1_id, enDuplaIds.has(i.id) ? 'en_dupla' : conInvitacion.has(i.id) ? 'invitacion_enviada' : 'disponible')
  }
  return { estado, inscripcionDeJugador }
}

async function categoriasPorJugador(db: SupabaseClient, torneoId: string): Promise<Map<string, number>> {
  const { data, error } = await db
    .from('torneo_inscripciones')
    .select('jugador1_id, categoria_id, torneo_categorias!inner(torneo_id)')
    .eq('torneo_categorias.torneo_id', torneoId)
    .neq('estado', 'retirada')
    .not('jugador1_id', 'is', null)
  if (error) throw error
  const cats = new Map<string, Set<string>>()
  for (const i of (data || []) as any[]) {
    if (!cats.has(i.jugador1_id)) cats.set(i.jugador1_id, new Set())
    cats.get(i.jugador1_id)!.add(i.categoria_id)
  }
  return new Map([...cats].map(([id, set]) => [id, set.size]))
}

export async function candidatosArmarDuplaAdmin(db: SupabaseClient, torneo: Torneo, categoriaId: string): Promise<Resultado<{ candidatos: CandidatoAdmin[] }>> {
  const categoria = await leerCategoria(db, categoriaId)
  if (!categoria || categoria.torneo_id !== torneo.id || categoria.modalidad !== 'doble') return { ok: false, error: 'Esa categoría no es de dobles de este torneo' }
  await vencerInvitaciones(db, [categoriaId])
  const { data: jugadores, error } = await db
    .from('jugadores')
    .select('id, nombre, genero, categoria, categoria_torneo, es_invitado, activo, estado_verificacion')
    .eq('activo', true)
    .eq('es_prueba', false)
    .eq('es_representante', false)
    .neq('estado_verificacion', 'no_permitido')
    .order('nombre')
  if (error) throw error
  const { estado } = await estadoDeCategoria(db, categoriaId)
  const candidatos = candidatosArmarAdmin({
    categoria,
    jugadores: (jugadores || []).map((j: any) => ({ ...j, esInvitado: !!j.es_invitado })),
    estadoEnCategoria: estado,
    categoriasDe: await categoriasPorJugador(db, torneo.id),
  })
  return { ok: true, candidatos }
}

export async function armarDuplaAdminConJugadores(
  db: SupabaseClient,
  torneo: Torneo,
  categoriaId: string,
  jugadorIds: [string, string],
  adminId: string,
): Promise<Resultado<{ equipoId: string; inscritos: string[] }>> {
  if (!['borrador', 'inscripcion'].includes(torneo.estado)) return { ok: false, error: 'El sorteo ya se hizo' }
  if (jugadorIds[0] === jugadorIds[1]) return { ok: false, error: 'Elige dos jugadores distintos' }
  const categoria = await leerCategoria(db, categoriaId)
  if (!categoria || categoria.torneo_id !== torneo.id || categoria.modalidad !== 'doble') return { ok: false, error: 'Esa categoría no es de dobles de este torneo' }
  if (categoria.sorteo_publicado_at || categoria.cancelada_at) return { ok: false, error: `${categoria.nombre} ya se sorteó o se canceló` }

  await vencerInvitaciones(db, [categoriaId])
  const jugadores = await leerJugadores(db, jugadorIds)
  const [a, b] = jugadorIds.map((id) => jugadores.get(id))
  if (!a || !b) return { ok: false, error: 'No encontramos a uno de los jugadores' }
  for (const x of [a, b]) if (!puedeJugar(x)) return { ok: false, error: `${x.nombre} no está activo en el club` }
  const err = errorDupla(categoria, a, b)
  if (err) return { ok: false, error: err }

  const { estado, inscripcionDeJugador } = await estadoDeCategoria(db, categoriaId)
  for (const x of [a, b]) if (estado.get(x.id) === 'en_dupla') return { ok: false, error: `${x.nombre} ya tiene dupla en ${categoria.nombre}` }

  const { data: invs, error: errInv } = await db.from('jugadores').select('id, es_invitado').in('id', jugadorIds)
  if (errInv) throw errInv
  const esInvitado = new Set((invs || []).filter((j: any) => j.es_invitado).map((j: any) => j.id))
  const momento = ahora().toISOString()

  // Inscribe a los que faltan (si el segundo falla, se deshace el primero).
  const creadas: string[] = []
  const inscripcionIds: string[] = []
  for (const x of [a, b]) {
    const existente = inscripcionDeJugador.get(x.id)
    if (existente) {
      inscripcionIds.push(existente)
      continue
    }
    const { data: nueva, error: errIns } = await db
      .from('torneo_inscripciones')
      .insert({
        categoria_id: categoriaId,
        jugador1_id: x.id,
        inscrita_por_admin: adminId,
        ...(esInvitado.has(x.id) ? { invitado_autorizado_por: adminId, invitado_autorizado_at: momento } : {}),
      })
      .select('id')
      .single()
    if (errIns) {
      if (creadas.length) await db.from('torneo_inscripciones').delete().in('id', creadas)
      return { ok: false, error: `${x.nombre}: ${mensajeErrorBaseInscripcion(errIns.message) ?? errIns.message}` }
    }
    creadas.push(nueva.id)
    inscripcionIds.push(nueva.id)
  }

  const { data: equipo, error: errE } = await db
    .from('torneo_equipos')
    .insert({ categoria_id: categoriaId, inscripcion1_id: inscripcionIds[0], inscripcion2_id: inscripcionIds[1], origen: 'admin', formado_por_admin: adminId })
    .select('id')
    .single()
  if (errE) {
    if (creadas.length) await db.from('torneo_inscripciones').delete().in('id', creadas)
    return { ok: false, error: mensajeErrorBaseInscripcion(errE.message) ?? errE.message }
  }

  // Invitados ya inscritos: armar la dupla cuenta como la autorización.
  const yaInscritosInvitados = [a, b].filter((x) => esInvitado.has(x.id) && !creadas.includes(inscripcionIds[[a, b].indexOf(x)])).map((x) => inscripcionIds[[a, b].indexOf(x)])
  if (yaInscritosInvitados.length) {
    await db.from('torneo_inscripciones')
      .update({ invitado_autorizado_por: adminId, invitado_autorizado_at: momento })
      .in('id', yaInscritosInvitados)
      .is('invitado_autorizado_at', null)
  }

  await cancelarInvitacionesDe(db, inscripcionIds, 'El admin armó la dupla')

  // Estado de cada inscripción y el monto que le toca pagar.
  const { data: montos } = await db.from('torneo_inscripciones').select('id, jugador1_id, monto_eur, monto_motivo').in('id', inscripcionIds)
  const montoDe = new Map((montos || []).map((m: any) => [m.jugador1_id, m]))
  for (const id of inscripcionIds) {
    try {
      const r = await recalcularInscripcion(db, id)
      if (r.antes !== 'confirmada' && r.despues === 'confirmada') await avisarInscripcionConfirmada(db, r)
    } catch (e: any) {
      console.error('[torneo] No se pudo recalcular la inscripción', id, e.message)
    }
  }

  const pagoDe = (jid: string) => {
    const m = montoDe.get(jid)
    return m ? textoMontoCorto({ monto_eur: Number(m.monto_eur), motivo: m.monto_motivo }) : ''
  }
  for (const [yo, otro] of [[a, b], [b, a]] as const) {
    const nuevo = creadas.includes(inscripcionIds[[a, b].indexOf(yo)])
    await notificarJugadores(db, [yo.id], {
      tipo: 'torneo_dupla',
      mensaje: nuevo
        ? `🤝 El admin te inscribió en ${categoria.nombre} con ${otro.nombre}. Solo falta reportar tu pago (${pagoDe(yo.id)} en Bs. a la tasa BCV del euro).`
        : `🤝 El admin armó tu dupla en ${categoria.nombre}: juegas con ${otro.nombre}.`,
      asunto: `🤝 Tu dupla en ${categoria.nombre}`,
      cuerpoHtml: () => nuevo
        ? `<p>El admin te inscribió en <strong>${escaparHtml(categoria.nombre)}</strong> del <strong>${escaparHtml(torneo.nombre)}</strong>, en dupla con <strong>${escaparHtml(otro.nombre)}</strong>.</p><p>Solo falta <strong>reportar tu pago</strong>: ${escaparHtml(pagoDe(yo.id))} en Bs. a la tasa BCV del euro. Entra a la app → <strong>Copa → Inscribirme</strong>.</p>`
        : `<p>El admin armó tu dupla en <strong>${escaparHtml(categoria.nombre)}</strong>: juegas con <strong>${escaparHtml(otro.nombre)}</strong>.</p>`,
    })
  }
  return { ok: true, equipoId: equipo.id, inscritos: creadas }
}

// Deshace una dupla antes del sorteo (para cambiar la pareja): los dos
// vuelven a "disponible".
export async function deshacerDuplaAdmin(db: SupabaseClient, torneo: Torneo, equipoId: string, adminId: string): Promise<Resultado> {
  if (!['borrador', 'inscripcion'].includes(torneo.estado)) return { ok: false, error: 'El sorteo ya se hizo' }
  const { data: e, error } = await db.from('torneo_equipos').select('id, categoria_id, inscripcion1_id, inscripcion2_id, estado').eq('id', equipoId).maybeSingle()
  if (error) throw error
  if (!e || e.estado !== 'activo' || !e.inscripcion2_id) return { ok: false, error: 'Esa dupla no está activa' }
  const { error: errU } = await db
    .from('torneo_equipos')
    .update({ estado: 'disuelto', disuelto_at: ahora().toISOString(), disuelto_por_admin: adminId })
    .eq('id', equipoId)
  if (errU) return { ok: false, error: errU.message }
  const { data: ins } = await db.from('torneo_inscripciones').select('jugador1_id').in('id', [e.inscripcion1_id, e.inscripcion2_id])
  const { data: cat } = await db.from('torneo_categorias').select('nombre').eq('id', e.categoria_id).single()
  await notificarJugadores(db, (ins || []).map((i: any) => i.jugador1_id), {
    tipo: 'torneo_dupla_deshecha',
    mensaje: `🎾 El admin deshizo tu dupla en ${cat?.nombre}. Sigues inscrito y disponible.`,
    asunto: `Cambio de dupla — ${cat?.nombre}`,
    cuerpoHtml: () => `<p>El admin deshizo tu dupla en <strong>${escaparHtml(cat?.nombre ?? '')}</strong> para cambiar las parejas. Sigues inscrito y <strong>disponible</strong>.</p>`,
  })
  return { ok: true }
}

export { telefonoLegible }
