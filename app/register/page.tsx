'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import CropperCarnet from './CropperCarnet'
import { formatTelefonoLocal, MAX_MENORES_REGISTRO } from '@/lib/registro'
import { ETIQUETA_PARENTESCO, PARENTESCOS } from '@/lib/torneoInfantil'

// Ficha de un hijo/a en el registro de un representante (misma validación
// que la ficha de la app: normalizarFichaMenor en lib/torneoInfantil.ts).
type HijoForm = {
  nombre: string
  apellido: string
  fecha_nacimiento: string
  genero: string
  parentesco: string
  emergencia_nombre: string
  emergencia_telefono: string
  autorizacionParticipacion: boolean
}
const hijoVacio = (): HijoForm => ({
  nombre: '', apellido: '', fecha_nacimiento: '', genero: '', parentesco: '',
  emergencia_nombre: '', emergencia_telefono: '', autorizacionParticipacion: false,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  border: '1px solid rgba(15,27,38,0.2)',
  borderRadius: '4px',
  fontSize: '15px',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-body)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontWeight: 600,
  color: 'var(--color-ink)',
  fontSize: '14px',
}

function RegisterForm() {
  const searchParams = useSearchParams()
  const nextParam = searchParams.get('next') || ''
  // Solo aceptamos rutas internas relativas (empiezan con "/" pero no "//"),
  // para que nadie pueda armar un enlace que redirija a un sitio externo.
  const destinoDespuesDeRegistrar = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/ladder'

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    categoria: '',
    genero: '',
    pin: '',
    numeroAccion: ''
  })
  // Invitado (no socio): cuenta sin N.º de acción, solo para los torneos a
  // los que lo invite el club, salvo que un admin lo habilite (lib/invitados.ts).
  const [esInvitado, setEsInvitado] = useState(false)
  // Representante (padre, madre...) que no juega: sin categoría ni género, y
  // con la ficha de sus hijos. ?tipo=representante lo deja elegido.
  const [esRepresentante, setEsRepresentante] = useState(searchParams.get('tipo') === 'representante')
  const [hijos, setHijos] = useState<HijoForm[]>([hijoVacio()])
  const cambiarHijo = (i: number, cambio: Partial<HijoForm>) =>
    setHijos((hs) => hs.map((h, j) => (j === i ? { ...h, ...cambio } : h)))
  const [fotoCarnet, setFotoCarnet] = useState<File | null>(null)
  const [previewCarnet, setPreviewCarnet] = useState<string | null>(null)
  const [fotoCarnetError, setFotoCarnetError] = useState('')
  const [archivoParaRecortar, setArchivoParaRecortar] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registroExitoso, setRegistroExitoso] = useState(false)
  const [emailRegistrado, setEmailRegistrado] = useState('')

  // Formatos que aceptamos para la foto del carné, y tamaño máximo del archivo.
  const FORMATOS_CARNET_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp']
  const TAMANO_MAXIMO_CARNET_MB = 5

  // El archivo elegido (de cámara o galería) pasa primero por la herramienta
  // de recorte — la foto final que se sube es la ya recortada al tamaño carné.
  const handleSeleccionArchivo = (file: File | null) => {
    setFotoCarnetError('')
    if (!file) return
    if (!FORMATOS_CARNET_ACEPTADOS.includes(file.type)) {
      setFotoCarnetError('❌ Formato no soportado — usa JPG, PNG o WEBP.')
      return
    }
    if (file.size > TAMANO_MAXIMO_CARNET_MB * 1024 * 1024) {
      setFotoCarnetError(`❌ La foto pesa demasiado — el máximo es ${TAMANO_MAXIMO_CARNET_MB}MB.`)
      return
    }
    setArchivoParaRecortar(file)
  }

  const handleCropConfirmado = (archivoRecortado: File) => {
    setFotoCarnet(archivoRecortado)
    if (previewCarnet) URL.revokeObjectURL(previewCarnet)
    setPreviewCarnet(URL.createObjectURL(archivoRecortado))
    setArchivoParaRecortar(null)
  }

  const handleCropCancelado = () => {
    setArchivoParaRecortar(null)
  }

  const quitarFotoCarnet = () => {
    if (previewCarnet) URL.revokeObjectURL(previewCarnet)
    setFotoCarnet(null)
    setPreviewCarnet(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Si el jugador adjuntó la foto de su carné, la subimos primero al bucket
      // "fotos-partidos" (carpeta carnets/) y guardamos la URL pública resultante.
      let fotoCarnetUrl: string | null = null
      if (fotoCarnet && !esInvitado) {
        const extension = fotoCarnet.name.split('.').pop() || 'jpg'
        const nombreArchivo = `carnets/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
        const { error: errorSubida } = await supabase.storage
          .from('fotos-partidos')
          .upload(nombreArchivo, fotoCarnet)
        if (errorSubida) throw new Error('No se pudo subir la foto del carné: ' + errorSubida.message)

        const { data: publicUrlData } = supabase.storage
          .from('fotos-partidos')
          .getPublicUrl(nombreArchivo)
        fotoCarnetUrl = publicUrlData.publicUrl
      }

      // El registro lo hace el servidor (/api/registro): valida los datos,
      // genera el token de verificación y manda el correo de bienvenida.
      const res = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.name,
          email: formData.email,
          telefono: formData.phone,
          categoria: esRepresentante ? null : formData.categoria,
          genero: esRepresentante ? null : formData.genero,
          pin: formData.pin,
          numeroAccion: esInvitado ? null : formData.numeroAccion,
          fotoCarnetUrl,
          esInvitado,
          esRepresentante,
          menores: esRepresentante ? hijos : [],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al registrar — intenta de nuevo.')

      // Ya no lo dejamos logueado de una vez — primero debe confirmar su correo.
      setEmailRegistrado(data.email)
      setRegistroExitoso(true)
      setFormData({ name: '', email: '', phone: '', categoria: '', genero: '', pin: '', numeroAccion: '' })
      setEsInvitado(false)
      setHijos([hijoVacio()])
      quitarFotoCarnet()
    } catch (err: any) {
      setError('❌ ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="court-bg" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--color-chalk)',
        borderRadius: '4px',
        borderTop: '3px solid var(--color-ball)',
        padding: '40px',
        width: '100%',
        maxWidth: '500px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <img
            src="/logo-hgv.png"
            alt="Escudo HGV Tennis Club"
            style={{ width: '88px', height: '88px', objectFit: 'contain', margin: '0 auto 12px auto', display: 'block' }}
          />
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            color: 'var(--color-ink)',
            fontSize: '28px',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            HGV Tennis Club
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-court)',
            fontSize: '12px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginTop: '8px',
          }}>
            {esRepresentante ? 'Registro de representante' : 'Registro de jugador'}
          </p>
        </div>

        {registroExitoso ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '32px', margin: '0 0 12px 0' }}>📬</p>
            <p style={{ fontSize: '15px', color: 'var(--color-ink)', marginBottom: '10px' }}>
              ¡Registro exitoso! Te enviamos un correo a <strong>{emailRegistrado}</strong> para confirmar tu cuenta.
            </p>
            <p style={{ fontSize: '14px', color: 'var(--color-line)', marginBottom: '24px' }}>
              Revisa tu bandeja de entrada (y la de spam, por si acaso) y haz clic en el enlace de verificación antes de iniciar sesión.
            </p>
            <a href={`/login?next=${encodeURIComponent(esRepresentante && !nextParam ? '/torneo/inscripcion/infantil' : destinoDespuesDeRegistrar)}`} style={{
              display: 'inline-block', color: 'var(--color-ink)', fontSize: '15px', fontWeight: 700,
              fontFamily: 'var(--font-body)', textDecoration: 'none', background: 'var(--color-ball)',
              borderRadius: '4px', padding: '12px 26px',
            }}>
              Ir a Iniciar sesión
            </a>
            <p style={{ marginTop: '18px' }}>
              <a
                href={`/reenviar-verificacion?email=${encodeURIComponent(emailRegistrado)}`}
                style={{ color: 'var(--color-court)', fontSize: '13px', textDecoration: 'underline' }}
              >
                ¿No te llegó el correo? Reenviar verificación
              </a>
            </p>
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '22px' }}>
            <label style={labelStyle}>¿Quién se registra? *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {([
                [false, '🎾 Soy jugador/a', 'Juego en la escalera o en los torneos del club.'],
                [true, '👨‍👧 Soy representante de un niño/a (no juego)', 'Solo inscribo a mi hijo/a en los torneos infantiles.'],
              ] as const).map(([valor, titulo, detalle]) => (
                <button
                  key={String(valor)}
                  type="button"
                  onClick={() => setEsRepresentante(valor)}
                  aria-pressed={esRepresentante === valor}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: '6px', cursor: 'pointer',
                    fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--color-ink)',
                    border: esRepresentante === valor ? '2px solid var(--color-court)' : '1px solid rgba(15,27,38,0.2)',
                    background: esRepresentante === valor ? 'rgba(212,225,87,0.25)' : 'white',
                  }}
                >
                  <strong>{titulo}</strong>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--color-line)', marginTop: '2px' }}>{detalle}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>{esRepresentante ? 'Tu nombre completo (representante) *' : 'Nombre completo *'}</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Ej: Juan García"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Email *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="Ej: juan@email.com"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Teléfono *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{
                ...inputStyle,
                width: 'auto',
                flex: '0 0 auto',
                background: '#f0f0f0',
                color: 'var(--color-line)',
                textAlign: 'center',
                fontWeight: 600,
              }}>
                +58
              </span>
              <input
                type="tel"
                required
                inputMode="numeric"
                value={formatTelefonoLocal(formData.phone)}
                onChange={(e) => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                placeholder="(xxx)-XXX-XXXX"
                maxLength={14}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '18px', fontSize: '14px', color: 'var(--color-ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={esInvitado} onChange={(e) => setEsInvitado(e.target.checked)} style={{ marginTop: '3px' }} />
            <span>
              <strong>No soy socio: me registro como invitado</strong>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--color-line)', marginTop: '2px' }}>
                {esRepresentante
                  ? 'Tu hijo/a podrá jugar si el club lo autoriza.'
                  : 'Podrás jugar los torneos a los que te invite el club. La escalera, los retos y las reservas son para socios, salvo que un administrador te habilite.'}
              </span>
            </span>
          </label>

          {!esInvitado && <>
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Número de acción (socio) *</label>
            <input
              type="text"
              required
              value={formData.numeroAccion}
              onChange={(e) => setFormData({...formData, numeroAccion: e.target.value})}
              placeholder="Ej: 1234"
              style={inputStyle}
            />
            <p style={{ fontSize: '12px', color: 'var(--color-line)', marginTop: '4px' }}>
              {esRepresentante
                ? 'El de la familia. Se usa también para tu hijo/a y el club lo validará.'
                : 'La escalera es exclusiva para socios del club — se validará tu número de acción.'}
            </p>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Foto de tu carné de socio (opcional)</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                handleSeleccionArchivo(e.target.files?.[0] || null)
                e.target.value = ''
              }}
              style={{ ...inputStyle, padding: '8px', background: 'white' }}
            />
            <p style={{ fontSize: '12px', color: 'var(--color-line)', marginTop: '4px' }}>
              Súbela ahora y te ahorras mostrar el carné físico cuando vayas a jugar — el club ya la tiene registrada. Después de elegirla podrás ajustarla al tamaño del carné. Formatos JPG, PNG o WEBP, máximo {TAMANO_MAXIMO_CARNET_MB}MB.
            </p>
            {fotoCarnetError && (
              <p style={{ fontSize: '12px', color: '#a83226', marginTop: '4px' }}>{fotoCarnetError}</p>
            )}
            {previewCarnet && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src={previewCarnet}
                  alt="Vista previa del carné"
                  style={{ maxWidth: '160px', maxHeight: '110px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(15,27,38,0.15)' }}
                />
                <button
                  type="button"
                  onClick={quitarFotoCarnet}
                  style={{ background: 'none', border: '1px solid #ccc', color: '#555', borderRadius: '4px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
          </>}

          {!esRepresentante && <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Género *</label>
            <select
              required
              value={formData.genero}
              onChange={(e) => setFormData({...formData, genero: e.target.value})}
              style={{ ...inputStyle, background: 'white' }}
            >
              <option value="">-- Selecciona tu género --</option>
              <option value="caballeros">Caballeros</option>
              <option value="damas">Damas</option>
            </select>
          </div>}

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Crea un PIN de 4 dígitos *</label>
            <input
              type="password"
              required
              maxLength={4}
              pattern="[0-9]{4}"
              inputMode="numeric"
              value={formData.pin}
              onChange={(e) => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})}
              placeholder="····"
              title="El PIN debe tener exactamente 4 dígitos"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', letterSpacing: '0.3em' }}
            />
            <p style={{ fontSize: '12px', color: 'var(--color-line)', marginTop: '4px' }}>
              {esRepresentante
                ? 'Lo usarás junto con tu email para entrar e inscribir a tu hijo/a.'
                : 'Lo usarás junto con tu email para iniciar sesión y gestionar tus retos.'}
            </p>
          </div>

          {esRepresentante ? (
            <div style={{ marginBottom: '24px' }}>
              {hijos.map((h, i) => (
                <FichaHijo
                  key={i}
                  indice={i}
                  total={hijos.length}
                  hijo={h}
                  onCambio={(c) => cambiarHijo(i, c)}
                  onQuitar={() => setHijos((hs) => hs.filter((_, j) => j !== i))}
                />
              ))}
              {hijos.length < MAX_MENORES_REGISTRO && (
                <button
                  type="button"
                  onClick={() => setHijos((hs) => [...hs, hijoVacio()])}
                  style={{ background: 'white', border: '1px dashed var(--color-court)', color: 'var(--color-ink)', borderRadius: '6px', padding: '10px 14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%' }}
                >
                  ➕ Agregar otro hijo/a
                </button>
              )}
              <p style={{ fontSize: '12px', color: 'var(--color-line)', marginTop: '8px' }}>
                La categoría del torneo la eliges después de entrar: la app sugiere la que le toca por su edad.
              </p>
            </div>
          ) : (
          <div style={{ marginBottom: '28px' }}>
            <label style={labelStyle}>Categoría *</label>
            <select
              required
              value={formData.categoria}
              onChange={(e) => setFormData({...formData, categoria: e.target.value})}
              style={{ ...inputStyle, background: 'white' }}
            >
              <option value="">-- Selecciona tu categoría --</option>
              <option value="sexta_novatos">Sexta Novato</option>
              <option value="sexta">Sexta</option>
              <option value="quinta">Quinta</option>
              <option value="cuarta">Cuarta</option>
            </select>
          </div>
          )}

          {error && (
            <div style={{
              background: 'rgba(197,60,50,0.1)', color: '#a83226',
              padding: '12px', borderRadius: '4px', marginBottom: '18px', textAlign: 'center', fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#ccc' : 'var(--color-ball)',
              color: 'var(--color-ink)',
              border: 'none',
              borderRadius: '4px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Registrando…' : 'Registrarme'}
          </button>
        </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a href="/" style={{
            display: 'inline-block',
            color: 'var(--color-ink)',
            fontSize: '15px',
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            textDecoration: 'none',
            border: '1px solid var(--color-court)',
            borderRadius: '4px',
            padding: '10px 24px',
          }}>
            🎾 Volver al inicio
          </a>
        </div>
      </div>

      {archivoParaRecortar && (
        <CropperCarnet
          archivo={archivoParaRecortar}
          onConfirmar={handleCropConfirmado}
          onCancelar={handleCropCancelado}
        />
      )}
    </div>
  )
}

function FichaHijo({ indice, total, hijo, onCambio, onQuitar }: {
  indice: number
  total: number
  hijo: HijoForm
  onCambio: (c: Partial<HijoForm>) => void
  onQuitar: () => void
}) {
  const campo = (etiqueta: string, nodo: React.ReactNode) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ ...labelStyle, fontSize: '13px' }}>{etiqueta}</label>
      {nodo}
    </div>
  )
  return (
    <fieldset style={{ border: '1px solid rgba(15,27,38,0.15)', borderLeft: '4px solid var(--color-ball)', borderRadius: '6px', padding: '14px', margin: '0 0 12px 0', background: 'white' }}>
      <legend style={{ fontWeight: 700, color: 'var(--color-ink)', fontSize: '14px', padding: '0 6px' }}>
        {total > 1 ? `Hijo/a ${indice + 1}` : 'Datos de tu hijo/a'}
      </legend>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>{campo('Nombre *', <input required value={hijo.nombre} onChange={(e) => onCambio({ nombre: e.target.value })} style={inputStyle} />)}</div>
        <div style={{ flex: 1 }}>{campo('Apellido *', <input required value={hijo.apellido} onChange={(e) => onCambio({ apellido: e.target.value })} style={inputStyle} />)}</div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>{campo('Fecha de nacimiento *', <input type="date" required value={hijo.fecha_nacimiento} onChange={(e) => onCambio({ fecha_nacimiento: e.target.value })} style={inputStyle} />)}</div>
        <div style={{ flex: 1 }}>{campo('Niño o niña *', (
          <select required value={hijo.genero} onChange={(e) => onCambio({ genero: e.target.value })} style={{ ...inputStyle, background: 'white' }}>
            <option value="">--</option>
            <option value="caballeros">Niño</option>
            <option value="damas">Niña</option>
          </select>
        ))}</div>
      </div>
      {campo('Tu parentesco *', (
        <select required value={hijo.parentesco} onChange={(e) => onCambio({ parentesco: e.target.value })} style={{ ...inputStyle, background: 'white' }}>
          <option value="">-- Selecciona --</option>
          {PARENTESCOS.map((p) => <option key={p} value={p}>{ETIQUETA_PARENTESCO[p]}</option>)}
        </select>
      ))}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>{campo('Contacto de emergencia *', <input required placeholder="Nombre" value={hijo.emergencia_nombre} onChange={(e) => onCambio({ emergencia_nombre: e.target.value })} style={inputStyle} />)}</div>
        <div style={{ flex: 1 }}>{campo('Su teléfono *', <input required type="tel" placeholder="0414-0000000" value={hijo.emergencia_telefono} onChange={(e) => onCambio({ emergencia_telefono: e.target.value })} style={inputStyle} />)}</div>
      </div>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: 'var(--color-ink)', cursor: 'pointer' }}>
        <input type="checkbox" required checked={hijo.autorizacionParticipacion} onChange={(e) => onCambio({ autorizacionParticipacion: e.target.checked })} style={{ marginTop: '3px' }} />
        <span>Soy su representante y lo/la autorizo a participar en las actividades de tenis del club. *</span>
      </label>
      {total > 1 && (
        <button type="button" onClick={onQuitar} style={{ marginTop: '10px', background: 'none', border: 'none', color: '#a83226', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
          Quitar este hijo/a
        </button>
      )}
    </fieldset>
  )
}

// useSearchParams() exige que el componente que lo usa esté envuelto en
// Suspense — si no, Next.js no puede generar la página estáticamente y el
// build falla. Este export es el que realmente usa Next.js como la página.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}
