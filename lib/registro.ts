// Validación del registro público de jugadores (/api/registro).
//
// El registro se hacía con un insert directo con la clave anónima, así que
// cualquiera podía escribir cualquier columna (estado_verificacion,
// email_verificado, categoria_torneo...). Ahora la ruta server inserta con
// service role solo lo que devuelve validarRegistro: los campos que el
// jugador llena en el formulario, ya normalizados. Lo demás (activo, token de
// verificación, estado de verificación) lo pone el servidor o el default de
// la tabla — nunca el cliente.

export const CATEGORIAS_REGISTRO = ['sexta_novatos', 'sexta', 'quinta', 'cuarta'] as const
export const GENEROS_REGISTRO = ['caballeros', 'damas'] as const

export type DatosRegistro = {
  nombre: string
  email: string
  telefono: string
  categoria: (typeof CATEGORIAS_REGISTRO)[number]
  genero: (typeof GENEROS_REGISTRO)[number]
  pin: string
  numero_accion: string | null
  foto_carnet_url: string | null
  // Registro como invitado (no socio, sin N.º de acción). Solo se acepta si
  // la ruta lo permite (opciones.permitirInvitado): la columna es_invitado
  // llega con la rama del torneo (sorteo/programación).
  es_invitado: boolean
}

export type ResultadoRegistro = { ok: true; datos: DatosRegistro } | { ok: false; error: string }

export type OpcionesRegistro = {
  // URL pública del proyecto de Supabase: la foto del carné tiene que estar
  // en nuestro bucket (fotos-partidos/carnets/), no en cualquier sitio.
  supabaseUrl: string
  permitirInvitado?: boolean
}

// Convierte "juan garcía" o "JUAN GARCÍA" a "Juan García"
export function toTitleCase(str: string) {
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Da formato (XXX)-XXX-XXXX a los 10 dígitos del teléfono
export function formatTelefonoLocal(digits: string) {
  const d = digits.replace(/\D/g, '').slice(0, 10)
  const area = d.slice(0, 3)
  const medio = d.slice(3, 6)
  const final = d.slice(6, 10)
  let out = ''
  if (area) out += `(${area}`
  if (area.length === 3) out += ')'
  if (medio) out += `-${medio}`
  if (final) out += `-${final}`
  return out
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function prefijoFotoCarnet(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/fotos-partidos/carnets/`
}

export function validarRegistro(entrada: unknown, opciones: OpcionesRegistro): ResultadoRegistro {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>

  const nombre = toTitleCase(texto(e.nombre))
  if (!nombre) return { ok: false, error: 'Escribe tu nombre completo.' }
  if (nombre.length > 100) return { ok: false, error: 'El nombre es demasiado largo.' }

  const email = texto(e.email).toLowerCase()
  if (!EMAIL_VALIDO.test(email) || email.length > 254) return { ok: false, error: 'Escribe un correo válido.' }

  const digitosTelefono = texto(e.telefono).replace(/\D/g, '')
  if (digitosTelefono.length !== 10) return { ok: false, error: 'El teléfono debe tener 10 dígitos, ej. (424)-123-4567.' }

  const categoria = texto(e.categoria)
  if (!(CATEGORIAS_REGISTRO as readonly string[]).includes(categoria)) return { ok: false, error: 'Selecciona tu categoría.' }

  const genero = texto(e.genero)
  if (!(GENEROS_REGISTRO as readonly string[]).includes(genero)) return { ok: false, error: 'Selecciona tu género.' }

  const pin = typeof e.pin === 'string' ? e.pin : ''
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'El PIN debe tener exactamente 4 dígitos.' }

  const esInvitado = e.esInvitado === true
  if (esInvitado && !opciones.permitirInvitado) return { ok: false, error: 'El registro como invitado todavía no está disponible.' }

  let numeroAccion: string | null = null
  let fotoCarnetUrl: string | null = null
  if (!esInvitado) {
    numeroAccion = texto(e.numeroAccion)
    if (!numeroAccion) return { ok: false, error: 'Escribe tu número de acción.' }
    if (numeroAccion.length > 30) return { ok: false, error: 'El número de acción es demasiado largo.' }

    const foto = texto(e.fotoCarnetUrl)
    if (foto) {
      const resto = foto.startsWith(prefijoFotoCarnet(opciones.supabaseUrl)) ? foto.slice(prefijoFotoCarnet(opciones.supabaseUrl).length) : ''
      if (!/^[\w.-]+$/.test(resto)) return { ok: false, error: 'La foto del carné no es válida — vuelve a subirla.' }
      fotoCarnetUrl = foto
    }
  }

  return {
    ok: true,
    datos: {
      nombre,
      email,
      telefono: `+58 ${formatTelefonoLocal(digitosTelefono)}`,
      categoria: categoria as DatosRegistro['categoria'],
      genero: genero as DatosRegistro['genero'],
      pin,
      numero_accion: numeroAccion,
      foto_carnet_url: fotoCarnetUrl,
      es_invitado: esInvitado,
    },
  }
}
