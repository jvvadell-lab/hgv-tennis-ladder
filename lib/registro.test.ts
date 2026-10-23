import { describe, expect, it } from 'vitest'
import { formatTelefonoLocal, prefijoFotoCarnet, toTitleCase, validarRegistro } from './registro'

const SUPABASE_URL = 'https://proyecto.supabase.co'
const opciones = { supabaseUrl: SUPABASE_URL }
const FOTO = `${SUPABASE_URL}/storage/v1/object/public/fotos-partidos/carnets/1729000000000-ab12cd.jpg`

const valido = {
  nombre: '  juan   GARCÍA ',
  email: ' Juan@Correo.COM ',
  telefono: '(424)-123-4567',
  categoria: 'sexta',
  genero: 'caballeros',
  pin: '0123',
  numeroAccion: ' 1234 ',
  fotoCarnetUrl: FOTO,
}

const error = (entrada: unknown, o = opciones) => {
  const r = validarRegistro(entrada, o)
  return r.ok ? null : r.error
}

describe('validarRegistro', () => {
  it('normaliza los datos del formulario', () => {
    expect(validarRegistro(valido, opciones)).toEqual({
      ok: true,
      datos: {
        nombre: 'Juan García',
        email: 'juan@correo.com',
        telefono: '+58 (424)-123-4567',
        categoria: 'sexta',
        genero: 'caballeros',
        pin: '0123',
        numero_accion: '1234',
        foto_carnet_url: FOTO,
        es_invitado: false,
      },
    })
  })

  it('solo devuelve los campos permitidos, aunque el cliente mande más', () => {
    const r = validarRegistro({
      ...valido,
      estado_verificacion: 'verificado',
      email_verificado: true,
      verificado_por: 'admin',
      categoria_torneo: 'cuarta',
      activo: false,
      token_verificacion: 'conocido',
      invitado_habilitado_at: '2026-10-20',
      id: '00000000-0000-0000-0000-000000000000',
    }, opciones)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.datos).sort()).toEqual(
        ['categoria', 'email', 'es_invitado', 'foto_carnet_url', 'genero', 'nombre', 'numero_accion', 'pin', 'telefono'],
      )
    }
  })

  it('la foto del carné es opcional', () => {
    const r = validarRegistro({ ...valido, fotoCarnetUrl: null }, opciones)
    expect(r.ok && r.datos.foto_carnet_url).toBe(null)
  })

  it.each([
    ['otro dominio', 'https://malo.example.com/carnets/a.jpg'],
    ['otro bucket', `${SUPABASE_URL}/storage/v1/object/public/otro/carnets/a.jpg`],
    ['fuera de carnets/', `${SUPABASE_URL}/storage/v1/object/public/fotos-partidos/Sponsors/a.png`],
    ['subir de carpeta', `${SUPABASE_URL}/storage/v1/object/public/fotos-partidos/carnets/../Sponsors/a.png`],
    ['con query', `${FOTO}?x=1`],
    ['solo el prefijo', prefijoFotoCarnet(SUPABASE_URL)],
  ])('rechaza una foto de carné ajena (%s)', (_caso, url) => {
    expect(error({ ...valido, fotoCarnetUrl: url })).toMatch(/foto del carné/)
  })

  it.each([
    ['nombre vacío', { nombre: '   ' }, /nombre/],
    ['nombre larguísimo', { nombre: 'a'.repeat(101) }, /nombre/],
    ['correo sin @', { email: 'juan.correo.com' }, /correo/],
    ['correo con espacios', { email: 'juan perez@x.com' }, /correo/],
    ['teléfono corto', { telefono: '424123' }, /teléfono/],
    ['teléfono largo', { telefono: '04241234567' }, /teléfono/],
    ['categoría inventada', { categoria: 'primera' }, /categoría/],
    ['género vacío', { genero: '' }, /género/],
    ['PIN de 3 dígitos', { pin: '123' }, /PIN/],
    ['PIN con letras', { pin: '12a4' }, /PIN/],
    ['PIN numérico (no string)', { pin: 1234 }, /PIN/],
    ['sin N.º de acción', { numeroAccion: ' ' }, /acción/],
  ])('rechaza: %s', (_caso, cambio, mensaje) => {
    expect(error({ ...valido, ...cambio })).toMatch(mensaje)
  })

  it('rechaza un cuerpo vacío o que no es objeto', () => {
    expect(error(null)).toBeTruthy()
    expect(error('texto')).toBeTruthy()
    expect(error([])).toBeTruthy()
  })

  describe('invitado (rama del torneo)', () => {
    const invitado = { ...valido, esInvitado: true, numeroAccion: '', fotoCarnetUrl: FOTO }

    it('no se acepta mientras la ruta no lo permita', () => {
      expect(error(invitado)).toMatch(/invitado/)
    })

    it('con permitirInvitado: sin N.º de acción ni carné', () => {
      const r = validarRegistro(invitado, { ...opciones, permitirInvitado: true })
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.datos.es_invitado).toBe(true)
        expect(r.datos.numero_accion).toBe(null)
        expect(r.datos.foto_carnet_url).toBe(null)
      }
    })

    it('solo true cuenta como invitado', () => {
      const r = validarRegistro({ ...valido, esInvitado: 'true' }, { ...opciones, permitirInvitado: true })
      expect(r.ok && r.datos.es_invitado).toBe(false)
    })
  })
})

describe('helpers', () => {
  it('toTitleCase', () => {
    expect(toTitleCase('MARÍA  josé')).toBe('María José')
  })
  it('formatTelefonoLocal', () => {
    expect(formatTelefonoLocal('4241234567')).toBe('(424)-123-4567')
    expect(formatTelefonoLocal('4241')).toBe('(424)-1')
  })
})
