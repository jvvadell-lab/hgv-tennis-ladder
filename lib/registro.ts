// Validación del registro público de jugadores (/api/registro).
//
// El registro se hacía con un insert directo con la clave anónima, así que
// cualquiera podía escribir cualquier columna (estado_verificacion,
// email_verificado, categoria_torneo...). Ahora la ruta server inserta con
// service role solo lo que devuelve validarRegistro: los campos que el
// jugador llena en el formulario, ya normalizados. Lo demás (activo, token de
// verificación, estado de verificación) lo pone el servidor o el default de
// la tabla — nunca el cliente.

import { normalizarFichaMenor, type FichaMenor } from './torneoInfantil'

export const CATEGORIAS_REGISTRO = ['sexta_novatos', 'sexta', 'quinta', 'cuarta'] as const
export const GENEROS_REGISTRO = ['caballeros', 'damas'] as const

export type DatosRegistro = {
  nombre: string
  email: string
  telefono: string
  // null solo en una cuenta de representante (no juega).
  categoria: (typeof CATEGORIAS_REGISTRO)[number] | null
  genero: (typeof GENEROS_REGISTRO)[number] | null
  pin: string
  numero_accion: string | null
  foto_carnet_url: string | null
  // Registro como invitado (no socio, sin N.º de acción). Solo se acepta si
  // la ruta lo permite (opciones.permitirInvitado): la columna es_invitado
  // llega con la rama del torneo (sorteo/programación).
  es_invitado: boolean
  // Representante de uno o más menores que no juega: sin categoría ni género,
  // fuera de las listas de jugadores (migración 20261104014443).
  es_representante: boolean
}

// Máximo de fichas de hijos que se cargan en el registro (después puede agregar más).
export const MAX_MENORES_REGISTRO = 4

export type ResultadoRegistro =
  | { ok: true; datos: DatosRegistro; menores: FichaMenor[] }
  | { ok: false; error: string }

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

// `hoy` (YYYY-MM-DD en Caracas) valida la fecha de nacimiento de los hijos.
export function validarRegistro(entrada: unknown, opciones: OpcionesRegistro, hoy: string): ResultadoRegistro {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>

  const nombre = toTitleCase(texto(e.nombre))
  if (!nombre) return { ok: false, error: 'Escribe tu nombre completo.' }
  if (nombre.length > 100) return { ok: false, error: 'El nombre es demasiado largo.' }

  const email = texto(e.email).toLowerCase()
  if (!EMAIL_VALIDO.test(email) || email.length > 254) return { ok: false, error: 'Escribe un correo válido.' }

  const digitosTelefono = texto(e.telefono).replace(/\D/g, '')
  if (digitosTelefono.length !== 10) return { ok: false, error: 'El teléfono debe tener 10 dígitos, ej. (424)-123-4567.' }

  const esRepresentante = e.esRepresentante === true

  let categoria: DatosRegistro['categoria'] = null
  let genero: DatosRegistro['genero'] = null
  if (!esRepresentante) {
    const c = texto(e.categoria)
    if (!(CATEGORIAS_REGISTRO as readonly string[]).includes(c)) return { ok: false, error: 'Selecciona tu categoría.' }
    categoria = c as DatosRegistro['categoria']
    const g = texto(e.genero)
    if (!(GENEROS_REGISTRO as readonly string[]).includes(g)) return { ok: false, error: 'Selecciona tu género.' }
    genero = g as DatosRegistro['genero']
  }

  // Fichas de los hijos: obligatorias (al menos una) para un representante;
  // opcionales para un jugador que también inscribe a sus hijos.
  const crudos = Array.isArray(e.menores) ? e.menores : []
  if (crudos.length > MAX_MENORES_REGISTRO) return { ok: false, error: `Puedes cargar hasta ${MAX_MENORES_REGISTRO} hijos en el registro; los demás, después desde la app.` }
  if (esRepresentante && crudos.length === 0) return { ok: false, error: 'Agrega los datos de tu hijo o hija.' }
  const menores: FichaMenor[] = []
  for (const [i, m] of crudos.entries()) {
    const r = normalizarFichaMenor(m, hoy)
    const quien = crudos.length > 1 ? ` (hijo/a ${i + 1})` : ''
    if ('error' in r) return { ok: false, error: r.error + quien + '.' }
    if ((m as any)?.autorizacionParticipacion !== true) {
      return { ok: false, error: `Marca la autorización de participación${quien}.` }
    }
    menores.push(r.ficha)
  }

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
      categoria,
      genero,
      pin,
      numero_accion: numeroAccion,
      foto_carnet_url: fotoCarnetUrl,
      es_invitado: esInvitado,
      es_representante: esRepresentante,
    },
    menores,
  }
}
