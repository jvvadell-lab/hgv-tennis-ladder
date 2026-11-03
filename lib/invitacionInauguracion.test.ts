import { describe, expect, it } from 'vitest'
import {
  ASUNTO_INAUGURACION, CIERRE_INSCRIPCIONES_RESPALDO, INICIO_INAUGURACION, URL_SITIO,
  armarCorreoInauguracion, destinatariosInauguracion, primerNombre, variantesPermitidas, type JugadorCorreo,
} from './invitacionInauguracion'

const j = (id: string, nombre: string, extra: Partial<JugadorCorreo> = {}): JugadorCorreo => ({
  id, nombre, email: `${id}@correo.com`, activo: true, es_prueba: false, ...extra,
})

describe('destinatariosInauguracion', () => {
  it('separa inscritos (A) y no inscritos (B)', () => {
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

describe('variantesPermitidas', () => {
  it('antes del cierre van A y B; después, solo A', () => {
    expect(variantesPermitidas(false)).toEqual(['inscrito', 'no_inscrito'])
    expect(variantesPermitidas(true)).toEqual(['inscrito'])
  })
})

describe('primerNombre', () => {
  it('toma el nombre de pila con mayúscula inicial', () => {
    expect(primerNombre('  JUAN   Vadell ')).toBe('Juan')
    expect(primerNombre('maría josé pérez')).toBe('María')
    expect(primerNombre('Ñeri')).toBe('Ñeri')
  })
})

describe('armarCorreoInauguracion', () => {
  it('usa el asunto pedido y el nombre de pila en el saludo', () => {
    const c = armarCorreoInauguracion('inscrito', 'juan vadell', 'cid:tarjeta')
    expect(c.asunto).toBe('Inauguración Copa Navidad 2026 – vie 6 de nov, 6:00 pm 🎾🎄')
    expect(c.asunto).toBe(ASUNTO_INAUGURACION)
    expect(c.html).toContain('Hola, Juan 🎾🎄')
    expect(c.texto.startsWith('Hola, Juan 🎾🎄')).toBe(true)
    expect(c.html).not.toContain('{nombre}')
    expect(c.texto).not.toContain('{nombre}')
  })

  it('pone la tarjeta embebida encima del texto', () => {
    const c = armarCorreoInauguracion('no_inscrito', 'Ana', 'cid:tarjeta')
    expect(c.html).toContain('src="cid:tarjeta"')
    expect(c.html.indexOf('<img')).toBeLessThan(c.html.indexOf('Hola, Ana'))
  })

  it('A enlaza a mis partidos; B a la inscripción', () => {
    const a = armarCorreoInauguracion('inscrito', 'Ana', 'x')
    const b = armarCorreoInauguracion('no_inscrito', 'Ana', 'x')
    expect(a.html).toContain(`<a href="${URL_SITIO}/torneo/mis-partidos"`)
    expect(a.html).toMatch(/>revisa tus partidos<\/a>/)
    expect(a.html).not.toContain('/torneo/inscripcion')
    expect(b.html).toContain(`<a href="${URL_SITIO}/torneo/inscripcion"`)
    expect(b.html).toMatch(/>la página del torneo<\/a>/)
    expect(b.html).not.toContain('/torneo/mis-partidos')
    expect(a.texto).toContain(`revisa tus partidos (${URL_SITIO}/torneo/mis-partidos)`)
    expect(b.texto).toContain(`la página del torneo (${URL_SITIO}/torneo/inscripcion)`)
    expect(b.texto).not.toContain('[')
  })

  it('cada versión lleva su texto propio y la firma', () => {
    const a = armarCorreoInauguracion('inscrito', 'Ana', 'x')
    const b = armarCorreoInauguracion('no_inscrito', 'Ana', 'x')
    expect(a.texto).toContain('¡y tú eres parte de ella!')
    expect(a.texto).toContain('El sorteo es el jueves 5')
    expect(b.texto).toContain('¡aún estás a tiempo!')
    expect(b.texto).not.toContain('parte de ella')
    for (const c of [a, b]) {
      expect(c.texto).toContain('brindis 🥂')
      expect(c.texto.endsWith('¡Te esperamos!\nComisión de Tenis HGV')).toBe(true)
      expect(c.html).toContain('¡Te esperamos!<br>Comisión de Tenis HGV')
    }
  })

  it('escapa el html del nombre y no deja que fabrique enlaces', () => {
    const c = armarCorreoInauguracion('no_inscrito', '<b>[x](/malo)</b>', 'x')
    expect(c.html).not.toContain('<b>')
    expect(c.html).not.toContain('/malo"')
    expect(c.html).toContain('&lt;b&gt;[x](/malo)&lt;/b&gt;')
  })
})

describe('fechas (hora de Caracas)', () => {
  it('la inauguración es el vie 6-nov-2026 a las 6:00 pm (22:00 UTC)', () => {
    expect(INICIO_INAUGURACION.toISOString()).toBe('2026-11-06T22:00:00.000Z')
  })
  it('el cierre de respaldo es el mié 4-nov a las 23:59 (05-nov 03:59 UTC)', () => {
    expect(CIERRE_INSCRIPCIONES_RESPALDO.toISOString()).toBe('2026-11-05T03:59:00.000Z')
  })
})
