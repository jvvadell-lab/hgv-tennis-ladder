import { describe, expect, it } from 'vitest'
import {
  INICIO_INAUGURACION, PLANTILLAS, armarCorreoInauguracion, destinatariosInauguracion, primerNombre, type JugadorCorreo,
} from './invitacionInauguracion'

const j = (id: string, nombre: string, extra: Partial<JugadorCorreo> = {}): JugadorCorreo => ({
  id, nombre, email: `${id}@correo.com`, activo: true, es_prueba: false, ...extra,
})

describe('destinatariosInauguracion', () => {
  it('separa inscritos y no inscritos', () => {
    const r = destinatariosInauguracion([j('a', 'Ana'), j('b', 'Beto')], ['b'])
    expect(r.map((d) => [d.jugador_id, d.variante])).toEqual([['a', 'no_inscrito'], ['b', 'inscrito']])
  })

  it('excluye inactivos, cuentas de prueba y correos vacíos o inválidos', () => {
    const r = destinatariosInauguracion([
      j('a', 'Ana'),
      j('b', 'Beto', { activo: false }),
      j('c', 'Caro', { es_prueba: true }),
      j('d', 'Dani', { email: '' }),
      j('e', 'Eva', { email: null }),
      j('f', 'Fede', { email: 'sin-arroba' }),
      j('g', 'Gabo', { activo: null }),
    ], [])
    expect(r.map((d) => d.jugador_id)).toEqual(['a'])
  })

  it('recorta espacios del correo y ordena por nombre', () => {
    const r = destinatariosInauguracion([j('z', 'Zoe', { email: '  zoe@x.com ' }), j('a', 'Álvaro')], [])
    expect(r.map((d) => d.nombre)).toEqual(['Álvaro', 'Zoe'])
    expect(r[1].email).toBe('zoe@x.com')
  })
})

describe('primerNombre', () => {
  it('toma la primera palabra con mayúscula inicial', () => {
    expect(primerNombre('  JUAN   Vadell ')).toBe('Juan')
    expect(primerNombre('maría josé pérez')).toBe('María')
    expect(primerNombre('Ñeri')).toBe('Ñeri')
  })
})

describe('armarCorreoInauguracion', () => {
  it('rellena {nombre} en asunto y cuerpo, y usa la imagen indicada', () => {
    const c = armarCorreoInauguracion('inscrito', 'juan vadell', 'cid:tarjeta')
    expect(c.asunto).not.toContain('{nombre}')
    expect(c.asunto).toContain('Juan')
    expect(c.html).toContain('src="cid:tarjeta"')
    expect(c.html).not.toContain('{nombre}')
    expect(c.texto).toContain('Juan')
  })

  it('usa una plantilla distinta para cada grupo', () => {
    const a = armarCorreoInauguracion('inscrito', 'Ana', 'x')
    const b = armarCorreoInauguracion('no_inscrito', 'Ana', 'x')
    expect(a.html).not.toBe(b.html)
    expect(PLANTILLAS.inscrito.parrafos).not.toEqual(PLANTILLAS.no_inscrito.parrafos)
  })

  it('escapa el html del nombre', () => {
    const c = armarCorreoInauguracion('no_inscrito', '<b>Ana</b>', 'x')
    expect(c.html).not.toContain('<b>Ana')
    expect(c.html).toContain('&lt;b&gt;ana&lt;/b&gt;')
  })
})

describe('INICIO_INAUGURACION', () => {
  it('es el viernes 6-nov-2026 a las 6:00 pm de Caracas (22:00 UTC)', () => {
    expect(INICIO_INAUGURACION.toISOString()).toBe('2026-11-06T22:00:00.000Z')
  })
})
