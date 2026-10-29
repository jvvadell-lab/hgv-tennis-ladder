import { describe, expect, it } from 'vitest'
import { formatearEur, textoMonto, textoMontoCorto, textoTarifas } from './torneoPrecios'

describe('textos de precios', () => {
  it('línea de tarifas del banner', () => {
    expect(textoTarifas({ monto_inscripcion_eur: 15, monto_inscripcion_adicional_eur: 10 }))
      .toBe('15 € por categoría · 2ª categoría o 2º hijo: 10 €')
  })

  it('línea de tarifas con la de invitados', () => {
    const t = { monto_inscripcion_eur: 15, monto_inscripcion_adicional_eur: 10, monto_inscripcion_invitado_eur: 20 }
    expect(textoTarifas(t))
      .toBe('15 € por categoría · 2ª categoría o 2º hijo: 10 € · Invitados (no socios): 20 € por categoría')
    expect(textoTarifas(t, { invitados: false }))
      .toBe('15 € por categoría · 2ª categoría o 2º hijo: 10 €')
  })

  it('montos con decimales', () => {
    expect(formatearEur('12.5')).toBe('12,5 €')
  })

  it('monto con su motivo', () => {
    expect(textoMonto({ monto_eur: 10, motivo: 'Segundo hijo' })).toBe('Segundo hijo: 10 €')
    expect(textoMontoCorto({ monto_eur: 15, motivo: 'Primera categoría' })).toBe('15 € (primera categoría)')
  })
})
