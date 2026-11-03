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
// inauguración de la Copa); texto = versión sin html para los clientes que la
// piden; remitente = nombre visible (por defecto "HGV Tennis Club").
export type OpcionesCorreo = {
  remitente?: string
  texto?: string
  embebidas?: { cid: string; nombreArchivo: string; contenido: Buffer; tipo: string }[]
}

export async function enviarCorreo(destinatario: string, asunto: string, html: string, opciones: OpcionesCorreo = {}) {
  const mensaje = {
    to: destinatario,
    subject: asunto,
    html,
    text: opciones.texto,
    attachments: opciones.embebidas?.map((e) => ({ cid: e.cid, filename: e.nombreArchivo, content: e.contenido, contentType: e.tipo })),
  }
  const remitente = opciones.remitente ?? 'HGV Tennis Club'
  // Entorno de pruebas local (npm run dev:staging, scripts/simular-torneo.ts):
  // no sale ningún correo, solo queda en la consola. Con CORREOS_SMTP_LOCAL=
  // puerto (un Mailpit en Docker, p. ej. 54325) se entrega a ese SMTP de
  // 127.0.0.1 para verlo en su bandeja web; tampoco sale a internet.
  if (process.env.CORREOS_DESACTIVADOS === '1') {
    const puertoLocal = Number(process.env.CORREOS_SMTP_LOCAL)
    if (puertoLocal > 0) {
      await nodemailer.createTransport({ host: '127.0.0.1', port: puertoLocal, secure: false, ignoreTLS: true })
        .sendMail({ ...mensaje, from: `"${remitente}" <staging@hgv.local>` })
    }
    console.info(`[correo ${puertoLocal > 0 ? 'a Mailpit local' : 'desactivado'}] ${asunto} → ${destinatario}`)
    return
  }
  const transporter = getTransporter()
  await transporter.sendMail({ ...mensaje, from: `"${remitente}" <${process.env.GMAIL_USER}>` })
}
