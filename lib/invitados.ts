// Invitados / wild card (decisiones del 20-oct-2026, docs/torneo-navidad/SPEC.md
// §2.1): un invitado (no socio) tiene cuenta normal sin N.º de acción
// (jugadores.es_invitado). Juega los torneos a los que lo invite el club;
// la escalera, los retos y las reservas son para socios, salvo que un admin
// lo habilite (jugadores.invitado_habilitado_at).

import type { SupabaseClient } from '@supabase/supabase-js'

export type EstadoInvitado = { es_invitado: boolean | null; invitado_habilitado_at: string | null }

export const invitadoSinHabilitar = (j: EstadoInvitado | null | undefined): boolean =>
  !!j?.es_invitado && !j.invitado_habilitado_at

export const MENSAJE_INVITADO_SIN_HABILITAR =
  'Tu cuenta es de invitado: puedes jugar los torneos a los que te invite el club. La escalera, los retos y las reservas son para socios; si el club te habilita, un administrador lo activa en tu cuenta.'

// Para las rutas de escalera, retos y reservas: el mensaje de bloqueo si el
// jugador es un invitado sin habilitar, o null si puede seguir.
export async function bloqueoPorInvitado(db: SupabaseClient, jugadorId: string): Promise<string | null> {
  const { data, error } = await db.from('jugadores').select('es_invitado, invitado_habilitado_at').eq('id', jugadorId).maybeSingle()
  if (error) throw error
  return invitadoSinHabilitar(data) ? MENSAJE_INVITADO_SIN_HABILITAR : null
}
