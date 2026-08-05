// Lee el número de "Acción" impreso en la foto del carné de socio usando la
// API de Claude (visión), y lo compara contra lo que el jugador escribió en
// el formulario. No bloquea nada — solo deja un registro para que el admin
// lo revise si no coinciden (las fotos de celular fallan lo suficiente como
// para no rechazar automáticamente).

export async function verificarNumeroAccion(
  fotoCarnetUrl: string,
  numeroAccionEscrito: string
): Promise<{ ocr: string | null; coincide: boolean | null }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { ocr: null, coincide: null }

    // Descargamos la imagen del bucket público y la convertimos a base64 —
    // la API de Claude necesita los bytes de la imagen, no solo la URL.
    const imgRes = await fetch(fotoCarnetUrl)
    if (!imgRes.ok) return { ocr: null, coincide: null }
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    const buffer = await imgRes.arrayBuffer()
    const base64Data = Buffer.from(buffer).toString('base64')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: contentType, data: base64Data } },
            {
              type: 'text',
              text: 'Este es un carné de socio de un club. Busca el campo que dice "Acción" y responde ÚNICAMENTE con el número que aparece ahí — sin texto adicional, sin puntos ni comas. Si no logras leerlo con certeza, responde exactamente: NO_LEGIBLE',
            },
          ],
        }],
      }),
    })

    if (!res.ok) return { ocr: null, coincide: null }
    const data = await res.json()
    const textoLeido: string = (data?.content?.[0]?.text || '').trim()

    if (!textoLeido || textoLeido === 'NO_LEGIBLE') {
      return { ocr: textoLeido || null, coincide: null }
    }

    // Comparamos solo los dígitos, para no fallar por puntos, espacios o ceros a la izquierda.
    const soloDigitos = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '')
    const coincide = soloDigitos(textoLeido) === soloDigitos(numeroAccionEscrito || '')

    return { ocr: textoLeido, coincide }
  } catch {
    // Si algo falla (red, formato inesperado, etc.), no rompemos el flujo del jugador —
    // simplemente queda sin verificar, y el admin lo revisa a simple vista como antes.
    return { ocr: null, coincide: null }
  }
}
