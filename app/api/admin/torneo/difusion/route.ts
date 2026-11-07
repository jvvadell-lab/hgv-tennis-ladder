import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { esFechaISO, paginasDePieza, partidosDeLaSemana, partidosDelDia, porValidarEntre, semanaDe, textoSugerido, type FormatoPieza, type TipoPieza } from '@/lib/torneoDifusion'
import { cargarPartidosDifusion } from '@/lib/torneoDifusionServidor'

// Lo que la pestaña 📣 Difusión necesita además de la imagen: cuántas páginas
// tiene la pieza, el texto sugerido y los resultados por validar del rango.
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })

    const q = new URL(request.url).searchParams
    const tipo = q.get('tipo') as TipoPieza
    const formato = q.get('formato') as FormatoPieza
    const fecha = q.get('fecha')
    if (!['dia', 'semana'].includes(tipo) || !['historia', 'post'].includes(formato) || !esFechaISO(fecha)) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const partidos = await cargarPartidosDifusion(supabaseServer())
    const filas = tipo === 'dia' ? partidosDelDia(partidos, fecha) : partidosDeLaSemana(partidos, fecha)
    const { lunes, viernes } = semanaDe(fecha)
    return NextResponse.json({
      ok: true,
      paginas: paginasDePieza(partidos, tipo, fecha, formato).length,
      partidos: filas.length,
      porValidar: tipo === 'dia' ? porValidarEntre(partidos, fecha, fecha) : porValidarEntre(partidos, lunes, viernes),
      texto: textoSugerido(filas, tipo, fecha),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al preparar la pieza' }, { status: 500 })
  }
}
