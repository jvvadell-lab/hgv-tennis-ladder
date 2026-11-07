import { describe, expect, it } from 'vitest'
import { MAX_BYTES_FOTO, aceptaFoto, errorArchivoFoto, fotoPublica, rutaFotoTorneo } from './torneoFotos'

const URL_BASE = 'https://x.supabase.co/storage/v1/object/public/fotos-partidos/'

describe('aceptaFoto', () => {
  it('solo los partidos jugados', () => {
    expect(aceptaFoto({ estado: 'jugado' })).toBe(true)
    for (const estado of ['pendiente', 'programado', 'wo', 'doble_wo']) expect(aceptaFoto({ estado })).toBe(false)
  })
})

describe('fotoPublica', () => {
  const p = { foto_url: 'u', validado: true, estado: 'jugado' }
  it('sale de un partido validado y jugado', () => expect(fotoPublica(p, false)).toBe('u'))
  it('no sale sin validar', () => expect(fotoPublica({ ...p, validado: false }, false)).toBeNull())
  it('no sale si el partido quedó en WO', () => expect(fotoPublica({ ...p, estado: 'wo' }, false)).toBeNull())
  it('no sale si falta la autorización del menor', () => expect(fotoPublica(p, true)).toBeNull())
})

describe('rutaFotoTorneo', () => {
  it('devuelve la ruta de la carpeta del torneo', () => {
    expect(rutaFotoTorneo(`${URL_BASE}torneo/abc-1.jpg`)).toBe('torneo/abc-1.jpg')
    expect(rutaFotoTorneo(`${URL_BASE}torneo/abc-1.jpg?t=1`)).toBe('torneo/abc-1.jpg')
  })
  it('no toca lo demás del bucket', () => {
    expect(rutaFotoTorneo(`${URL_BASE}Sponsors/logo.webp`)).toBeNull()
    expect(rutaFotoTorneo(`${URL_BASE}abc-1.jpg`)).toBeNull()
    expect(rutaFotoTorneo(`${URL_BASE}torneo/../Sponsors/logo.webp`)).toBeNull()
    expect(rutaFotoTorneo(null)).toBeNull()
  })
})

describe('errorArchivoFoto', () => {
  it('acepta JPG, PNG y WebP dentro del límite', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(errorArchivoFoto({ type, size: 1000 })).toBeNull()
  })
  it('rechaza otros tipos y lo que pesa de más', () => {
    expect(errorArchivoFoto({ type: 'image/svg+xml', size: 1000 })).toMatch(/JPG/)
    expect(errorArchivoFoto({ type: 'image/jpeg', size: MAX_BYTES_FOTO + 1 })).toMatch(/máximo/)
  })
})
