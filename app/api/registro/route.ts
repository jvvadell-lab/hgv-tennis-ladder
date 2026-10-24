import { NextResponse, after } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { validarRegistro } from '@/lib/registro'
import { enviarCorreoBienvenida, verificarCarnetRegistro } from '@/lib/registroServidor'
import { vincularInvitacionesPorTelefono } from '@/lib/torneoDoblesServidor'

const MENSAJE_EMAIL_DUPLICADO =
  'Ya existe un jugador registrado con ese correo. Si es tuyo, usa "¿Olvidaste tu PIN?" en la página de inicio de sesión.'

// Ruta pública (sin sesión): registro de un jugador nuevo. Inserta con
// service role solo los campos que devuelve validarRegistro (lib/registro.ts)
// — el estado de verificación, el correo verificado, la categoría de torneo,
// etc. nunca vienen del cliente. La clave anónima ya no puede insertar en
// jugadores (migración 20261022124304_jugadores_cerrar_columnas_anon).
export async function POST(request: Request) {
  try {
    const entrada = await request.json().catch(() => null)
    const resultado = validarRegistro(entrada, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '', permitirInvitado: true })
    if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 })
    // Invitado (no socio): sin N.º de acción ni carné (lib/invitados.ts).
    const datos = resultado.datos

    const db = supabaseServer()

    const { data: existente, error: errExist } = await db
      .from('jugadores')
      .select('id')
      .ilike('email', datos.email.replace(/[\\%_]/g, '\\$&')) // sin comodines: "juan_p@" no debe chocar con "juanap@"
      .maybeSingle()
    if (errExist) throw errExist
    if (existente) return NextResponse.json({ error: MENSAJE_EMAIL_DUPLICADO }, { status: 409 })

    // El correo debe quedar verificado antes de poder iniciar sesión — el
    // token se genera aquí y solo viaja en el correo de bienvenida.
    const { data: nuevo, error } = await db
      .from('jugadores')
      .insert([{ ...datos, activo: true, token_verificacion: crypto.randomUUID() }])
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: MENSAJE_EMAIL_DUPLICADO }, { status: 409 })
      throw error
    }

    // Correo de bienvenida y lectura del carné después de responder: si
    // fallan, el registro ya quedó hecho (el jugador puede reenviar el correo).
    after(async () => {
      await Promise.allSettled([
        enviarCorreoBienvenida(db, nuevo.id),
        verificarCarnetRegistro(db, nuevo.id),
        // Invitaciones a formar dupla en el torneo hechas a su teléfono antes de que tuviera cuenta.
        vincularInvitacionesPorTelefono(db, nuevo.id, datos.telefono),
      ]).then((r) => r.forEach((x) => x.status === 'rejected' && console.error('[registro] después del alta:', x.reason)))
    })

    return NextResponse.json({ ok: true, email: datos.email })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error al registrar: ' + (err.message || 'intenta de nuevo') }, { status: 500 })
  }
}
