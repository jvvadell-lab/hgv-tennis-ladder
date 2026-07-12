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

export async function enviarCorreo(destinatario: string, asunto: string, html: string) {
  const transporter = getTransporter()
  await transporter.sendMail({
    from: `"HGV Tennis Club" <${process.env.GMAIL_USER}>`,
    to: destinatario,
    subject: asunto,
    html,
  })
}
