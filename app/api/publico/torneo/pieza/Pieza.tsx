import { ALTO_DIA, ALTO_FILA, fechaEncabezado, type DiaDifusion, type FilaDifusion, type FormatoPieza, type LadoFila } from '@/lib/torneoDifusion'

// La pieza que se publica (SPEC §18), con el estilo del flyer de la
// inauguración. Satori solo entiende flexbox y no dibuja emojis sin ir a
// internet: por eso aquí no hay ninguno.

export const AZUL_MARINO = '#0B1F3A'
const DORADO = '#E3B341'
const AZUL = '#1E4E9C'
const ROJO = '#C7102E'
const BLANCO = '#FFFFFF'
const TENUE = '#A9B6C9'
const TITULOS = 'Barlow Condensed'

export type LogoPieza = { nombre: string; src: string | null; fondo: 'claro' | 'oscuro' }

type Props = {
  formato: FormatoPieza
  encabezado: string          // HOY EN LA COPA | PROGRAMACIÓN DE LA SEMANA
  detalle: string             // VIE 6 NOV | 9 AL 13 NOV
  dias: DiaDifusion[]
  conEncabezadoDia: boolean
  pagina: number
  paginas: number
  logoHgv: string
  logoComision: string
  patrocinantes: LogoPieza[]
}

function Lado({ lado, prefijo, resaltar }: { lado: LadoFila; prefijo: boolean; resaltar: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 42 }}>
      <div style={{ display: 'flex', width: 44, flexShrink: 0, fontSize: 24, color: TENUE, fontWeight: 500 }}>{prefijo ? 'vs' : ''}</div>
      <div style={{
        display: 'block', flexShrink: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 32, lineHeight: 1.25,
        fontWeight: lado.ganador ? 700 : 500,
        color: lado.ganador ? DORADO : resaltar ? TENUE : lado.conocido ? BLANCO : TENUE,
      }}>{lado.texto}</div>
      {lado.nota && <div style={{ display: 'flex', flexShrink: 0, marginLeft: 14, fontSize: 24, fontWeight: 700, color: lado.ganador ? DORADO : TENUE }}>{lado.nota}</div>}
    </div>
  )
}

function Fila({ f }: { f: FilaDifusion }) {
  const conResultado = f.estado === 'jugado' || f.estado === 'wo'
  return (
    <div style={{ display: 'flex', height: ALTO_FILA - 12, marginBottom: 12, background: 'rgba(255,255,255,0.06)', borderLeft: `6px solid ${f.estado === 'programado' ? AZUL : DORADO}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: 150, flexShrink: 0 }}>
        <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 800, fontSize: 52, color: BLANCO, lineHeight: 1 }}>{f.hora}</div>
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 500, color: TENUE, marginTop: 6 }}>{f.cancha}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 20 }}>
        <div style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: TITULOS, fontWeight: 700, fontSize: 27, letterSpacing: 1, color: DORADO, marginBottom: 2 }}>
          {`${f.categoria} · ${f.etapa}`.toUpperCase()}
        </div>
        <Lado lado={f.a} prefijo={false} resaltar={conResultado && !f.a.ganador} />
        <Lado lado={f.b} prefijo resaltar={conResultado && !f.b.ganador} />
      </div>
      {f.marcador && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0, maxWidth: 270, paddingRight: 22, textAlign: 'right', fontFamily: TITULOS, fontWeight: 800, fontSize: 38, color: BLANCO, lineHeight: 1.05 }}>
          {f.marcador}
        </div>
      )}
    </div>
  )
}

function Logo({ p, ancho, alto }: { p: LogoPieza; ancho: number; alto: number }) {
  const oscuro = p.fondo === 'oscuro'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: ancho, height: alto, margin: 4, borderRadius: 8, background: oscuro ? AZUL_MARINO : BLANCO }}>
      {p.src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={p.src} width={ancho - 16} height={alto - 12} style={{ objectFit: 'contain' }} alt="" />
        : <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: oscuro ? BLANCO : AZUL_MARINO, textAlign: 'center' }}>{p.nombre}</div>}
    </div>
  )
}

export default function Pieza({ formato, encabezado, detalle, dias, conEncabezadoDia, pagina, paginas, logoHgv, logoComision, patrocinantes }: Props) {
  const historia = formato === 'historia'
  const logo = historia ? 118 : 96
  const vacio = !dias.length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: AZUL_MARINO, fontFamily: 'Inter', color: BLANCO }}>
      <div style={{ display: 'flex', height: 12, background: DORADO, flexShrink: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: historia ? '56px 48px 0' : '30px 48px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoHgv} width={logo} height={logo} style={{ objectFit: 'contain' }} alt="" />
          <div style={{ display: 'flex', width: 2, height: logo - 26, background: AZUL, margin: '0 22px' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoComision} width={logo} height={logo} style={{ objectFit: 'contain' }} alt="" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 700, fontSize: 34, letterSpacing: 4, color: DORADO }}>COMISIÓN DE TENIS</div>
          <div style={{ display: 'flex', fontSize: 25, fontWeight: 500, marginTop: 4 }}>Hermandad Gallega de Valencia</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: historia ? '44px 48px 30px' : '20px 48px 18px', flexShrink: 0 }}>
        <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 800, fontSize: encabezado.length > 20 ? 84 : historia ? 92 : 76, lineHeight: 1, textAlign: 'center', whiteSpace: 'nowrap' }}>{encabezado}</div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 800, fontSize: historia ? 76 : 62, lineHeight: 1, color: DORADO }}>{detalle}</div>
          {paginas > 1 && <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 700, fontSize: 40, color: TENUE, marginLeft: 24 }}>{`${pagina}/${paginas}`}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '0 40px', justifyContent: 'center', alignItems: vacio ? 'center' : 'stretch' }}>
        {vacio && <div style={{ display: 'flex', fontSize: 38, fontWeight: 500, color: TENUE }}>Sin partidos programados</div>}
        {dias.map((d) => (
          <div key={d.fecha} style={{ display: 'flex', flexDirection: 'column' }}>
            {conEncabezadoDia && (
              <div style={{ display: 'flex', alignItems: 'center', height: ALTO_DIA, fontFamily: TITULOS, fontWeight: 800, fontSize: 40, letterSpacing: 2, color: BLANCO }}>{fechaEncabezado(d.fecha)}</div>
            )}
            {d.filas.map((f) => <Fila key={f.id} f={f} />)}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ display: 'flex', height: 6, background: DORADO }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: historia ? 66 : 54, background: AZUL, fontFamily: TITULOS, fontWeight: 700, fontSize: 30, letterSpacing: 4 }}>
          COPA NAVIDAD HGV 2026
        </div>
        <div style={{ display: 'flex', height: 8, background: ROJO }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: BLANCO, padding: historia ? '16px 20px 60px' : '8px 20px 12px' }}>
          <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 700, fontSize: 22, letterSpacing: 6, color: AZUL_MARINO, marginBottom: 4 }}>PATROCINAN</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
            {patrocinantes.map((p) => <Logo key={p.nombre} p={p} ancho={122} alto={historia ? 72 : 56} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
