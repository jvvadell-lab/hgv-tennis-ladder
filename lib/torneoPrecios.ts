// Precios de inscripción del torneo (SPEC §2.5). La regla vive en la base:
// la función torneo_monto_inscripcion calcula monto y motivo, y el trigger
// torneo_inscripciones_fijar_monto lo deja fijado al crear la inscripción.
// Las tarifas salen de torneos.monto_inscripcion_eur (1ª) y
// monto_inscripcion_adicional_eur (2ª y siguientes); los adultos invitados
// (no socios) pagan monto_inscripcion_invitado_eur en cada categoría.
// Aquí solo hay textos.

export type TarifasTorneo = {
  monto_inscripcion_eur: number
  monto_inscripcion_adicional_eur: number
  // Opcional: no llega si la migración del 29-oct aún no está aplicada.
  monto_inscripcion_invitado_eur?: number | null
}

// Monto que le tocaría (o que tiene fijado) una inscripción, con su motivo.
export type MontoInscripcion = {
  monto_eur: number
  motivo: string
}

// Monto fijado en una inscripción; ajuste = nota del admin si lo cambió a mano.
export type MontoFijado = MontoInscripcion & { ajuste: string | null }

export function formatearEur(monto: number | string): string {
  return `${Number(monto).toLocaleString('es-VE', { maximumFractionDigits: 2 })} €`
}

// "15 € por categoría · 2ª categoría o 2º hijo: 10 € · Invitados (no socios): 20 € por categoría"
// invitados: false en pantallas solo infantiles (los niños no pagan tarifa de invitado).
export function textoTarifas(t: TarifasTorneo, opciones: { invitados?: boolean } = {}): string {
  const base = `${formatearEur(t.monto_inscripcion_eur)} por categoría · 2ª categoría o 2º hijo: ${formatearEur(t.monto_inscripcion_adicional_eur)}`
  if (opciones.invitados === false || !t.monto_inscripcion_invitado_eur) return base
  return `${base} · Invitados (no socios): ${formatearEur(t.monto_inscripcion_invitado_eur)} por categoría`
}

// "Segunda categoría: 10 €"
export function textoMonto(m: MontoInscripcion): string {
  return `${m.motivo}: ${formatearEur(m.monto_eur)}`
}

// Para avisos y correos: "10 € (segunda categoría)"
export function textoMontoCorto(m: MontoInscripcion): string {
  return `${formatearEur(m.monto_eur)} (${m.motivo.charAt(0).toLowerCase()}${m.motivo.slice(1)})`
}
