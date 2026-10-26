import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Sube el logo de un patrocinante a fotos-partidos/Sponsors/ con el service
// role. El panel ya lo manda reducido a WebP (~480 px, conserva la
// transparencia), así que aquí solo se valida tipo y tamaño.
// Sin SVG: puede traer scripts embebidos.
const TIPOS = ['image/webp', 'image/png', 'image/jpeg']
const MAX_BYTES = 600 * 1024

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const form = await request.formData()
    const archivo = form.get('logo')
    if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo del logo' }, { status: 400 })
    if (!TIPOS.includes(archivo.type)) {
      return NextResponse.json({ error: 'El logo debe ser PNG, JPG o WebP' }, { status: 400 })
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: 'El logo pesa demasiado (máximo 600 KB)' }, { status: 400 })
    }

    const ext = archivo.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `Sponsors/logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const db = supabaseServer()
    const { error } = await db.storage.from('fotos-partidos').upload(path, archivo, {
      contentType: archivo.type,
      cacheControl: '31536000',
    })
    if (error) throw error
    const { data } = db.storage.from('fotos-partidos').getPublicUrl(path)
    return NextResponse.json({ ok: true, url: data.publicUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al subir el logo' }, { status: 500 })
  }
}
