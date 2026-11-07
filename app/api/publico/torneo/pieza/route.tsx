import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import { supabaseServer } from '@/lib/supabaseServer'
import { hoyEnCaracas } from '@/lib/tiempo'
import { MEDIDAS_PIEZA, esFechaISO, fechaCorta, paginasDePieza, tituloSemana, type FormatoPieza, type TipoPieza } from '@/lib/torneoDifusion'
import { cargarPartidosDifusion } from '@/lib/torneoDifusionServidor'
import Pieza, { type LogoPieza } from './Pieza'

// PNG de una pieza de difusión (SPEC §18):
//   ?tipo=dia|semana&fecha=YYYY-MM-DD&formato=historia|post&pagina=N
// Solo datos públicos. Caché corta: refleja lo validado sin gastar egress.

// Los archivos que lee van declarados en outputFileTracingIncludes (next.config.ts).
const leer = (...ruta: string[]) => readFile(join(/*turbopackIgnore: true*/ process.cwd(), ...ruta))
const comoDataUrl = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`

const fuentes = () => Promise.all(([
  ['Inter', 500, 'Inter-500.ttf'],
  ['Inter', 700, 'Inter-700.ttf'],
  ['Barlow Condensed', 700, 'BarlowCondensed-700.ttf'],
  ['Barlow Condensed', 800, 'BarlowCondensed-800.ttf'],
] as const).map(async ([name, weight, archivo]) => ({ name, weight, style: 'normal' as const, data: await leer('assets', 'fuentes', archivo) })))

// Los logos del repo tienen su .png; los que el admin sube a Storage sirven
// tal cual si son PNG o JPG. Un WebP de Storage no se puede dibujar: sale su nombre.
async function logoDe(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null
  const local = logoUrl.match(/^\/patrocinantes\/([\w-]+)\.webp$/)
  if (local) return comoDataUrl(await leer('public', 'patrocinantes', 'png', `${local[1]}.png`))
  return /\.(png|jpe?g)(\?|$)/i.test(logoUrl) ? logoUrl : null
}

async function cargarPatrocinantes(): Promise<LogoPieza[]> {
  const { data, error } = await supabaseServer().from('patrocinantes').select('nombre, logo_url, fondo').eq('activo', true).order('orden')
  if (error) throw error
  return Promise.all((data || []).map(async (p) => ({ nombre: p.nombre, fondo: p.fondo, src: await logoDe(p.logo_url).catch(() => null) })))
}

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams
    const tipo = q.get('tipo') as TipoPieza
    const formato = q.get('formato') as FormatoPieza
    const fecha = q.get('fecha') ?? hoyEnCaracas()
    const pagina = Number(q.get('pagina') ?? 1)
    if (!['dia', 'semana'].includes(tipo) || !['historia', 'post'].includes(formato) || !esFechaISO(fecha) || !Number.isInteger(pagina) || pagina < 1) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const [partidos, patrocinantes, fonts, logoHgv, logoComision] = await Promise.all([
      cargarPartidosDifusion(supabaseServer()),
      cargarPatrocinantes(),
      fuentes(),
      leer('public', 'logo-hgv-escudo.png'),
      leer('public', 'logo-comision-tenis.png'),
    ])
    const paginas = paginasDePieza(partidos, tipo, fecha, formato)
    if (pagina > paginas.length) return NextResponse.json({ error: 'Esa página no existe' }, { status: 404 })

    const { ancho, alto } = MEDIDAS_PIEZA[formato]
    const [encabezado, detalle] = tipo === 'dia'
      ? ['HOY EN LA COPA', fechaCorta(fecha)]
      : tituloSemana(fecha).split(' · ')

    return new ImageResponse(
      <Pieza
        formato={formato}
        encabezado={encabezado}
        detalle={detalle}
        dias={paginas[pagina - 1]}
        conEncabezadoDia={tipo === 'semana'}
        pagina={pagina}
        paginas={paginas.length}
        logoHgv={comoDataUrl(logoHgv)}
        logoComision={comoDataUrl(logoComision)}
        patrocinantes={patrocinantes}
      />,
      { width: ancho, height: alto, fonts, headers: { 'Cache-Control': 'public, s-maxage=60' } },
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al generar la pieza' }, { status: 500 })
  }
}
