// Cierre manual por categoría y lista de espera — helpers de servidor
// (service role). Lógica pura en lib/torneoCierre.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarCorreo } from '@/lib/email'
import { ahora, formatearFechaHora } from '@/lib/tiempo'
import type { Torneo } from '@/lib/torneo'
import { cierreVencido, errorAnotarseEnEspera, ordenEspera } from '@/lib/torneoCierre'
import { errorGeneros, mensajeErrorBaseInscripcion, nivelAdmitido, nivelParaTorneo } from '@/lib/torneoInscripcion'
import { correoTorneo, escaparHtml, notificarJugadores } from '@/lib/torneoServidor'
import type { Nivel } from '@/lib/torneo'

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const COLUMNAS_CATEGORIA = 'id, nombre, modalidad, genero, categoria_nivel, cupo, es_infantil, inscripciones_abiertas, sorteo_publicado_at, cancelada_at'

// Pasó el cierre programado con categorías abiertas: avisa por correo a los
// admins UNA vez (torneos.cierre_vencido_avisado_at). Se llama al leer el
// panel o la pantalla del jugador (sin cron nuevo). Devuelve las categorías
// abiertas, para la alerta del panel.
export async function revisarCierreVencido(db: SupabaseClient, torneo: Torneo): Promise<string[]> {
  const { data: categorias, error } = await db.from('torneo_categorias').select(COLUMNAS_CATEGORIA).eq('torneo_id', torneo.id).order('orden')
  if (error) throw error
  const abiertas = cierreVencido(torneo, (categorias || []) as any, ahora()).map((c) => c.nombre)
  if (!abiertas.length || torneo.cierre_vencido_avisado_at) return abiertas

  // Marca primero (solo un proceso gana) y después avisa.
  const { data: marcado, error: errM } = await db
    .from('torneos')
    .update({ cierre_vencido_avisado_at: ahora().toISOString() })
    .eq('id', torneo.id)
    .is('cierre_vencido_avisado_at', null)
    .select('id')
  if (errM) throw errM
  if (!marcado?.length) return abiertas
  try {
    const { data: admins } = await db.from('administradores').select('nombre, email').not('email', 'is', null)
    const lista = abiertas.map((n) => `<li>${escaparHtml(n)}</li>`).join('')
    await Promise.all((admins || []).filter((a) => a.email).map((a) =>
      enviarCorreo(a.email, `⚠️ Cierre programado vencido — ${torneo.nombre}`, correoTorneo(a.nombre || 'admin', `
        <p>Ya pasó el cierre programado de inscripciones (<strong>${escaparHtml(formatearFechaHora(torneo.cierre_inscripciones_at!))}</strong>, hora de Caracas) y estas categorías <strong>siguen abiertas</strong>:</p>
        <ul>${lista}</ul>
        <p>Ciérralas desde <strong>Admin → Torneo</strong> cuando decidas (arma antes las duplas que falten). Las invitaciones pendientes ya vencieron.</p>
      `)).catch((e) => console.error('[torneo] Falló el aviso de cierre vencido:', e.message))))
  } catch (err: any) {
    console.error('[torneo] No se pudo avisar el cierre vencido:', err.message)
  }
  return abiertas
}

// ---------------------------------------------------------------------------
// Lista de espera
// ---------------------------------------------------------------------------

export async function anotarEnEspera(db: SupabaseClient, torneo: Torneo, categoriaId: string, jugadorId: string): Promise<Resultado> {
  const { data: c, error } = await db.from('torneo_categorias').select(COLUMNAS_CATEGORIA + ', torneo_id').eq('id', categoriaId).maybeSingle()
  if (error) throw error
  const cat = c as any
  if (!cat || cat.torneo_id !== torneo.id || cat.es_infantil) return { ok: false, error: 'Categoría no válida' }
  const { data: j } = await db.from('jugadores').select('id, nombre, genero, categoria, categoria_torneo').eq('id', jugadorId).single()
  if (cat.genero !== 'mixto' && errorGeneros(cat.genero, [j!.genero])) return { ok: false, error: errorGeneros(cat.genero, [j!.genero])! }
  if (!nivelAdmitido(cat.categoria_nivel as Nivel | null, nivelParaTorneo(j!))) return { ok: false, error: `Tu categoría no corresponde a ${cat.nombre}` }

  const [{ count: ocupados }, { data: mia }, { data: enLista }] = await Promise.all([
    db.from('torneo_inscripciones').select('id', { count: 'exact', head: true }).eq('categoria_id', categoriaId).neq('estado', 'retirada'),
    db.from('torneo_inscripciones').select('id').eq('categoria_id', categoriaId).eq('jugador1_id', jugadorId).neq('estado', 'retirada').maybeSingle(),
    db.from('torneo_lista_espera').select('id').eq('categoria_id', categoriaId).eq('jugador_id', jugadorId).eq('estado', 'esperando').maybeSingle(),
  ])
  const err = errorAnotarseEnEspera({ estadoTorneo: torneo.estado, categoria: cat, ocupados: ocupados ?? 0, yaInscrito: !!mia, yaEnLista: !!enLista })
  if (err) return { ok: false, error: err }
  const { error: errI } = await db.from('torneo_lista_espera').insert({ categoria_id: categoriaId, jugador_id: jugadorId })
  if (errI) {
    if (errI.message.includes('torneo_lista_espera_una')) return { ok: false, error: 'Ya estás en la lista de espera' }
    throw errI
  }
  return { ok: true }
}

export async function salirDeEspera(db: SupabaseClient, categoriaId: string, jugadorId: string): Promise<Resultado> {
  const { data, error } = await db
    .from('torneo_lista_espera')
    .update({ estado: 'salio', resuelta_at: ahora().toISOString() })
    .eq('categoria_id', categoriaId).eq('jugador_id', jugadorId).eq('estado', 'esperando')
    .select('id')
  if (error) throw error
  return data?.length ? { ok: true } : { ok: false, error: 'No estabas en la lista de espera' }
}

// Lista de espera de unas categorías, en orden de llegada, con nombres.
export async function listasDeEspera(db: SupabaseClient, categoriaIds: string[]) {
  if (!categoriaIds.length) return []
  const { data, error } = await db
    .from('torneo_lista_espera')
    .select('id, categoria_id, jugador_id, estado, created_at, jugadores(nombre)')
    .in('categoria_id', categoriaIds)
    .eq('estado', 'esperando')
  if (error) throw error
  return categoriaIds.flatMap((cid) => ordenEspera((data || []).filter((e: any) => e.categoria_id === cid)).map((e: any) => ({
    id: e.id as string, categoria_id: cid, jugador_id: e.jugador_id as string, nombre: (e.jugadores?.nombre as string) ?? '—', created_at: e.created_at as string, puesto: e.puesto as number,
  })))
}

// El admin inscribe al de la lista (aunque la categoría esté cerrada; el
// trigger revisa el cupo y el máximo de 2 categorías). Antes del sorteo.
export async function inscribirDesdeEspera(db: SupabaseClient, torneo: Torneo, esperaId: string, adminId: string): Promise<Resultado<{ inscripcionId: string }>> {
  if (!['borrador', 'inscripcion'].includes(torneo.estado)) return { ok: false, error: 'El sorteo ya se hizo' }
  const { data: e, error } = await db
    .from('torneo_lista_espera')
    .select('id, categoria_id, jugador_id, estado, torneo_categorias(nombre, sorteo_publicado_at, cancelada_at, torneo_id), jugadores(nombre)')
    .eq('id', esperaId)
    .maybeSingle()
  if (error) throw error
  const cat = (e as any)?.torneo_categorias
  if (!e || e.estado !== 'esperando' || cat?.torneo_id !== torneo.id) return { ok: false, error: 'Ya no está en la lista de espera' }
  if (cat.sorteo_publicado_at || cat.cancelada_at) return { ok: false, error: `${cat.nombre} ya se sorteó o se canceló` }

  const { data: ins, error: errI } = await db
    .from('torneo_inscripciones')
    .insert({ categoria_id: e.categoria_id, jugador1_id: e.jugador_id, inscrita_por_admin: adminId })
    .select('id')
    .single()
  if (errI) return { ok: false, error: mensajeErrorBaseInscripcion(errI.message) ?? errI.message }
  await db.from('torneo_lista_espera')
    .update({ estado: 'inscrito', resuelta_at: ahora().toISOString(), inscripcion_id: ins.id, inscrito_por_admin: adminId })
    .eq('id', esperaId)

  await notificarJugadores(db, [e.jugador_id], {
    tipo: 'torneo_lista_espera_inscrito',
    mensaje: `🎉 Se liberó un lugar en ${cat.nombre}: el admin te inscribió desde la lista de espera. Falta reportar tu pago.`,
    asunto: `🎉 Entraste en ${cat.nombre} — ${torneo.nombre}`,
    cuerpoHtml: () => `<p>Se liberó un lugar en <strong>${escaparHtml(cat.nombre)}</strong> y el admin te inscribió desde la lista de espera.</p><p>Falta reportar tu pago (${torneo.monto_inscripcion_eur} € en Bs. a la tasa BCV del euro)${''}. En dobles, el admin te ayuda a formar la dupla.</p>`,
  })
  return { ok: true, inscripcionId: ins.id }
}
