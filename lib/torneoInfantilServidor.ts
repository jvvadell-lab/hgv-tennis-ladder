// Sección Infantil del torneo — helpers de servidor (reciben el cliente de
// Supabase con service role). Los usan la inscripción del representante
// (app/api/jugador/torneo/infantil/...) y la del admin
// (app/api/admin/torneo/infantil/...). La lógica pura está en lib/torneoInfantil.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ahora } from '@/lib/tiempo'
import type { Torneo } from '@/lib/torneo'
import { fechaCorteEdad, validarInscripcionMenor, type CategoriaInfantil } from '@/lib/torneoInfantil'
import { mensajeErrorBaseInscripcion } from '@/lib/torneoInscripcion'
import { escaparHtml, notificarRepresentante, type MenorConRepresentante } from '@/lib/torneoServidor'

export const COLUMNAS_MENOR =
  'id, nombre, apellido, fecha_nacimiento, genero, numero_accion, representante_jugador_id, representante_nombre, representante_telefono, representante_correo, parentesco, emergencia_nombre, emergencia_telefono, autorizacion_participacion, autorizacion_participacion_at, autorizacion_imagen, autorizacion_imagen_at, created_at'

export type CategoriaInfantilFila = CategoriaInfantil & { cupo: number; es_infantil: boolean; duracion_min: number; formato_partido: string; orden: number }

export async function categoriasInfantiles(db: SupabaseClient, torneoId: string): Promise<CategoriaInfantilFila[]> {
  const { data, error } = await db
    .from('torneo_categorias')
    .select('id, nombre, genero, edad_min, edad_max, cupo, es_infantil, duracion_min, formato_partido, orden')
    .eq('torneo_id', torneoId)
    .eq('es_infantil', true)
    .order('orden')
  if (error) throw error
  return (data || []) as CategoriaInfantilFila[]
}

type MenorParaInscribir = MenorConRepresentante & { genero: string; fecha_nacimiento: string; numero_accion: string | null }

// Valida e inscribe a un menor en una categoría infantil. Antes de insertar
// guarda las autorizaciones de esta inscripción (la de participación es
// obligatoria y se vuelve a pedir en cada inscripción; la de imagen queda
// como se marcó ahora). El trigger torneo_inscripciones_validar repite edad,
// género, duplicado, máximo 2 y cupo como red de seguridad.
export async function inscribirMenor(
  db: SupabaseClient,
  p: {
    torneo: Torneo
    menor: MenorParaInscribir
    categoriaId: string
    autorizacionParticipacion: boolean
    autorizacionImagen: boolean
    inscritaPor: { jugadorId: string } | { adminId: string }
  }
): Promise<{ ok: false; error: string } | { ok: true; inscripcionId: string; categoriaNombre: string }> {
  const categorias = await categoriasInfantiles(db, p.torneo.id)
  const categoria = categorias.find((c) => c.id === p.categoriaId)
  if (!categoria) return { ok: false, error: 'Esa categoría infantil no es de este torneo' }

  const { data: vivas, error: errVivas } = await db
    .from('torneo_inscripciones')
    .select('categoria_id, menor_id')
    .in('categoria_id', categorias.map((c) => c.id))
    .neq('estado', 'retirada')
  if (errVivas) throw errVivas

  const validacion = validarInscripcionMenor({
    estadoTorneo: p.torneo.estado,
    soloSocios: p.torneo.solo_socios,
    fechaCorte: fechaCorteEdad(p.torneo),
    categoria,
    menor: p.menor,
    autorizacionParticipacion: p.autorizacionParticipacion,
    ocupados: (vivas || []).filter((i) => i.categoria_id === categoria.id).length,
    categoriasDelMenor: [...new Set((vivas || []).filter((i) => i.menor_id === p.menor.id).map((i) => i.categoria_id))],
    porAdmin: 'adminId' in p.inscritaPor,
  })
  if (!validacion.ok) return validacion

  const momento = ahora().toISOString()
  const { error: errAut } = await db
    .from('torneo_menores')
    .update({
      autorizacion_participacion: true,
      autorizacion_participacion_at: momento,
      autorizacion_imagen: p.autorizacionImagen,
      autorizacion_imagen_at: p.autorizacionImagen ? momento : null,
      updated_at: momento,
    })
    .eq('id', p.menor.id)
  if (errAut) throw errAut

  const { data: nueva, error: errIns } = await db
    .from('torneo_inscripciones')
    .insert({
      categoria_id: categoria.id,
      jugador1_id: null,
      menor_id: p.menor.id,
      inscrita_por: 'jugadorId' in p.inscritaPor ? p.inscritaPor.jugadorId : null,
      inscrita_por_admin: 'adminId' in p.inscritaPor ? p.inscritaPor.adminId : null,
    })
    .select('id')
    .single()
  if (errIns) {
    const claro = mensajeErrorBaseInscripcion(errIns.message)
    if (claro) return { ok: false, error: claro }
    throw errIns
  }

  const pagoPendiente = p.menor.representante_jugador_id
    ? `Falta reportar el pago (${p.torneo.monto_inscripcion_eur} € en Bs. a la tasa BCV del euro del día del pago) desde la app, en <strong>Torneo Navidad → Inscribir a mi hijo/a</strong>,`
    : `El pago (${p.torneo.monto_inscripcion_eur} € en Bs. a la tasa BCV del euro del día del pago) se coordina con el club,`
  await notificarRepresentante(db, p.menor, {
    tipo: 'torneo_inscripcion',
    mensaje: `🎄 ${p.menor.nombre} quedó inscrito en ${categoria.nombre} (${p.torneo.nombre}). Falta el pago y que el admin certifique la categoría.`,
    asunto: `🎄 Inscripción de ${p.menor.nombre} en el ${p.torneo.nombre}`,
    cuerpoHtml: `
      <p><strong>${escaparHtml(p.menor.nombre)} ${escaparHtml(p.menor.apellido)}</strong> quedó inscrito en <strong>${escaparHtml(categoria.nombre)}</strong> del <strong>${escaparHtml(p.torneo.nombre)}</strong>.</p>
      <div style="background: #fff8e1; border-left: 4px solid #f0b400; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
        La inscripción queda <strong>pendiente</strong>. ${pagoPendiente} y el admin tiene que certificar la categoría según la fecha de nacimiento.
      </div>
      <p>Autorización de uso de imagen: <strong>${p.autorizacionImagen ? 'sí' : 'no'}</strong>.</p>
    `,
  })

  return { ok: true, inscripcionId: nueva.id, categoriaNombre: categoria.nombre }
}
