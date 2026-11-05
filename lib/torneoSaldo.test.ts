import { describe, expect, it } from 'vitest'
import { estadoInscripcionCalculado, pendientePagoDe, pendientesInscripcion, textoPendiente } from './torneoInscripcion'

// Saldo: el admin sube el monto de una inscripción después del pago (p. ej.
// una invitada inscrita antes de la tarifa de 20 €) y lo pagado ya no alcanza.
const TASA = 999.76 // Bs. por €
const pago = (eur: number, validado: boolean) => ({ jugador_id: 'g', validado, monto: Math.round(eur * TASA * 100) / 100, tasa_bcv_eur: TASA })

describe('pendientePagoDe', () => {
  it('sin pago / por validar como antes', () => {
    expect(pendientePagoDe('g', [], 20)).toEqual({ tipo: 'pago', jugadorId: 'g' })
    expect(pendientePagoDe('g', [pago(15, false)], 20)).toEqual({ tipo: 'pago_por_validar', jugadorId: 'g' })
  })
  it('validado y completo: nada pendiente', () => {
    expect(pendientePagoDe('g', [pago(20, true)], 20)).toBeNull()
  })
  it('validado pero el monto subió: saldo de la diferencia', () => {
    expect(pendientePagoDe('g', [pago(15, true)], 20)).toEqual({ tipo: 'saldo', jugadorId: 'g', saldoEur: 5 })
  })
  it('la diferencia reportada y por validar: pago por validar', () => {
    expect(pendientePagoDe('g', [pago(15, true), pago(5, false)], 20)).toEqual({ tipo: 'pago_por_validar', jugadorId: 'g' })
  })
  it('los dos validados: completo', () => {
    expect(pendientePagoDe('g', [pago(15, true), pago(5, true)], 20)).toBeNull()
  })
  it('el redondeo de la tasa no es saldo', () => {
    expect(pendientePagoDe('g', [pago(19.97, true)], 20)).toBeNull()
  })
  it('sin monto o sin tasa en el pago, se comporta como antes', () => {
    expect(pendientePagoDe('g', [pago(15, true)])).toBeNull()
    expect(pendientePagoDe('g', [{ jugador_id: 'g', validado: true }], 20)).toBeNull()
  })
})

describe('la inscripción no se confirma con saldo', () => {
  const datos = {
    estado: 'pendiente_pago' as const, nivelCategoria: null, soloSocios: true, invitadoAutorizado: true,
    jugadores: [{ id: 'g', categoria_torneo: 'sexta', es_invitado: true }],
  }
  it('saldo → pendiente, con su texto', () => {
    const d = { ...datos, pagos: [pago(15, true)], montoEur: '20.00' }
    expect(estadoInscripcionCalculado(d)).toBe('pendiente_pago')
    const [p] = pendientesInscripcion(d)
    expect(textoPendiente(p, null)).toBe('Falta pagar la diferencia: 5,00 €')
    expect(textoPendiente(p, 'Genesis')).toBe('Falta la diferencia de Genesis: 5,00 €')
  })
  it('con la diferencia validada → confirmada', () => {
    expect(estadoInscripcionCalculado({ ...datos, pagos: [pago(15, true), pago(5, true)], montoEur: 20 })).toBe('confirmada')
  })
})
