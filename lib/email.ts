import nodemailer from 'nodemailer'

function getTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD

  if (!user || !pass) {
    throw new Error('Faltan las variables de entorno GMAIL_USER o GMAIL_APP_PASSWORD')
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

// Imagen embebida en el html con <img src="cid:…"> (la invitación a la
// inauguración de la Copa); texto = versión sin html para los clientes que la piden.
export type OpcionesCorreo = {
  texto?: string
  embebidas?: { cid: string; nombreArchivo: string; contenido: Buffer; tipo: string }[]
}

export async function enviarCorreo(destinatario: string, asunto: string, html: string, opciones: OpcionesCorreo = {}) {
  // Entorno de pruebas local (npm run dev:staging, scripts/simular-torneo.ts):
  // no sale ningún correo, solo queda en la consola.
  if (process.env.CORREOS_DESACTIVADOS === '1') {
    console.info(`[correo desactivado] ${asunto} → ${destinatario}`)
    return
  }
  const transporter = getTransporter()
  await transporter.sendMail({
    from: `"HGV Tennis Club" <${process.env.GMAIL_USER}>`,
    to: destinatario,
    subject: asunto,
    html,
    text: opciones.texto,
    attachments: opciones.embebidas?.map((e) => ({ cid: e.cid, filename: e.nombreArchivo, content: e.contenido, contentType: e.tipo })),
  })
}
