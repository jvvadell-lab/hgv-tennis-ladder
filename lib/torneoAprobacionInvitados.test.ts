import { describe, expect, it } from 'vitest'
import { porAprobar, requiereAprobacionInvitacion } from './torneoDobles'

describe('aprobación previa de invitaciones a no socios', () => {
  const conAprobacion = { invitar_no_socios_con_aprobacion: true }
  const sinAprobacion = { invitar_no_socios_con_aprobacion: false }

  it('en una categoría que la exige: no socio y teléfono sin cuenta sí, socio no', () => {
    expect(requiereAprobacionInvitacion(conAprobacion, { es_invitado: true })).toBe(true)
    expect(requiereAprobacionInvitacion(conAprobacion, null)).toBe(true)
    expect(requiereAprobacionInvitacion(conAprobacion, { es_invitado: false })).toBe(false)
  })

  it('en las demás categorías nunca', () => {
    expect(requiereAprobacionInvitacion(sinAprobacion, { es_invitado: true })).toBe(false)
    expect(requiereAprobacionInvitacion({}, null)).toBe(false)
  })

  it('por aprobar hasta que el admin la aprueba', () => {
    expect(porAprobar({ requiere_aprobacion: true, aprobada_at: null })).toBe(true)
    expect(porAprobar({ requiere_aprobacion: true, aprobada_at: '2026-11-04T18:00:00Z' })).toBe(false)
    expect(porAprobar({ requiere_aprobacion: false, aprobada_at: null })).toBe(false)
  })
})
