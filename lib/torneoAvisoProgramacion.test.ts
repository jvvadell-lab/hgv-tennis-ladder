import { beforeEach, describe, expect, it, vi } from 'vitest'

const enviarCorreo = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/email', () => ({ enviarCorreo }))

import { avisarProgramacion, textosAvisoProgramacion, type PartidoDetalle } from './torneoProgramacionServidor'
import type { Horario } from './torneoProgramacion'

const TORNEO = 'Torneo Navidad HGV 2026'
const lineas = ['Mixto con handicap – Primera ronda · Partido 1: A vs B — viernes, HGV1', 'Quinta · Grupo A: C vs D — lunes, HGV2']

describe('aviso de programación oficial', () => {
  const t = textosAvisoProgramacion(TORNEO, lineas, false)

  it('asunto y mensaje de la app', () => {
    expect(t.asunto).toBe('🎾 Programación oficial — Torneo Navidad HGV 2026')
    expect(t.mensaje).toBe(`📅 Programación oficial del ${TORNEO}: 2 partidos. ${lineas[0]}… Horarios oficiales: no se aceptan cambios.`)
    expect(textosAvisoProgramacion(TORNEO, lineas.slice(0, 1), false).mensaje).toBe(`📅 Programación oficial del ${TORNEO}: 1 partido. ${lineas[0]}. Horarios oficiales: no se aceptan cambios.`)
  })
  it('el cuerpo va en el orden pedido', () => {
    const orden = [
      'Estimado/a jugador/a:',
      'La Comisión de Tenis del Club Hermandad Gallega de Valencia publica la programación oficial del',
      'Estos son tus partidos:',
      'Primera ronda · Partido 1',
      'Normas de la programación',
      'obligatorio cumplimiento. No se aceptan solicitudes de cambio de fecha, hora ni cancha.',
      'Preséntate con antelación, listo para jugar a la hora indicada.',
      'Pasados 15 minutos de la hora fijada sin presentarse, se declarará W.O. a favor del rival.',
      'por causas de fuerza mayor (lluvia o indisponibilidad de canchas)',
      'tu inscripción debe estar pagada y validada.',
      'Gracias por tu puntualidad y compromiso: son los que dan categoría a este torneo. ¡Mucho éxito!',
      'Comisión de Tenis · Club Hermandad Gallega de Valencia',
    ]
    const posiciones = orden.map((texto) => t.cuerpoHtml.indexOf(texto))
    expect(posiciones).not.toContain(-1)
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b))
  })
  it('ya no pide avisar al admin', () => {
    expect(t.cuerpoHtml).not.toMatch(/avísale al admin/i)
    expect(textosAvisoProgramacion(TORNEO, lineas, true).cuerpoHtml).not.toMatch(/avísale al admin/i)
  })
  it('escapa los nombres', () => {
    expect(textosAvisoProgramacion('A & B', ['<x>'], false).cuerpoHtml).toContain('A &amp; B')
    expect(textosAvisoProgramacion('A', ['<x>'], false).cuerpoHtml).toContain('&lt;x&gt;')
  })
})

describe('aviso de reprogramación', () => {
  it('asunto y texto', () => {
    const t = textosAvisoProgramacion(TORNEO, lineas, true)
    expect(t.asunto).toBe('📅 Reprogramación — Torneo Navidad HGV 2026')
    expect(t.cuerpoHtml).toContain('La Comisión ha reprogramado tu partido por causa de fuerza mayor:')
  })
})

describe('correo que llega al jugador', () => {
  const db = {
    from: (tabla: string) => tabla === 'notificaciones'
      ? { insert: async () => ({ error: null }) }
      : { select: () => ({ in: async () => ({ data: [{ id: 'j1', nombre: 'Ana', email: 'ana@ejemplo.invalid' }], error: null }) }) },
  } as never
  const partido = { id: 'p', categoriaNombre: 'Mixto con handicap', fase: 'grupo', grupoLetra: 'A', orden: 1, formatoLlave: 'cuadros', nombre_a: 'A', nombre_b: 'B', avisar: ['j1'] } as unknown as PartidoDetalle
  const horarios = new Map<string, Horario>([['p', { cancha: 'HGV1', inicio: Date.parse('2026-11-06T22:30:00Z') }]])
  beforeEach(() => enviarCorreo.mockClear())
  const html = () => (enviarCorreo.mock.calls[0] as unknown as string[])[2]

  it('la programación oficial no repite saludo ni firma de la plantilla', async () => {
    await avisarProgramacion(db, TORNEO, [partido], horarios, { cambio: false })
    expect(html()).toContain('Estimado/a jugador/a:')
    expect(html()).not.toContain('Hola Ana')
    expect(html()).not.toContain('HGV Tennis Club')
    expect(html()).not.toContain('estado de tu inscripción')
  })
  it('la reprogramación conserva la plantilla', async () => {
    await avisarProgramacion(db, TORNEO, [partido], horarios, { cambio: true })
    expect(html()).toContain('Hola Ana')
    expect(html()).toContain('La Comisión ha reprogramado tu partido')
  })
})
