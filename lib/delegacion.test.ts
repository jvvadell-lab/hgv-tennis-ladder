import { describe, expect, it } from 'vitest'
import { etiquetaExterno, nombrePersonaDelegacion, numeroAccionDe } from './delegacion'

describe('invitados en Delegación', () => {
  const socio = { jugadores: { nombre: 'Ana', numero_accion: '123', es_invitado: false }, nombre_externo: null }
  const invitado = { jugadores: { nombre: 'Luis', numero_accion: null, es_invitado: true }, nombre_externo: null }

  it('un jugador invitado sin acción muestra INV', () => {
    expect(numeroAccionDe(invitado)).toBe('INV')
    expect(numeroAccionDe(socio)).toBe('123')
  })

  it('su nombre lleva la etiqueta de invitado (también en la tabla y el PDF, vía etiquetaExterno)', () => {
    expect(etiquetaExterno(invitado)).toBe('Invitado')
    expect(etiquetaExterno(socio)).toBeNull()
    expect(nombrePersonaDelegacion(invitado)).toBe('Luis — Invitado')
    expect(nombrePersonaDelegacion(socio)).toBe('Ana')
  })

  it('el nombre libre sigue igual', () => {
    expect(numeroAccionDe({ jugadores: null, nombre_externo: 'Pepe', numero_accion_externo: '9', es_socio: true })).toBe('9')
    expect(nombrePersonaDelegacion({ jugadores: null, nombre_externo: 'Pepe', es_socio: false })).toBe('Pepe — Invitado')
  })
})
