import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request } from 'express'
import { env } from '../config/env.js'
import { whatsappPublicState } from '../whatsapp/state.js'

const COOKIE_NAME = 'chronos_pairing_access'
const COOKIE_MAX_AGE_MS = 60 * 60 * 1000

function tokenDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw) return null

  for (const pair of raw.split(';')) {
    const index = pair.indexOf('=')
    if (index < 0) continue
    const key = pair.slice(0, index).trim()
    if (key !== name) continue
    return decodeURIComponent(pair.slice(index + 1).trim())
  }

  return null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function page(body: string, autoRefresh = false): string {
  const refresh = autoRefresh ? '<meta http-equiv="refresh" content="5">' : ''
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${refresh}
<title>CHRONOS · WhatsApp</title>
</head>
<body>
<main>
<h1>CHRONOS · WhatsApp</h1>
${body}
</main>
</body>
</html>`
}

function accessForm(message = ''): string {
  const warning = message ? `<p><strong>${escapeHtml(message)}</strong></p>` : ''
  return page(`${warning}
<p>Introduce la clave privada de vinculación configurada en Railway.</p>
<form method="get" action="/">
<label for="key">Clave de acceso</label><br>
<input id="key" name="key" type="password" autocomplete="current-password" required>
<button type="submit">Entrar</button>
</form>`)
}

function pairingStatusPage(): string {
  const state = whatsappPublicState.status
  const number = escapeHtml(whatsappPublicState.number || 'No configurado')

  if (state === 'CONNECTED') {
    return page(`<h2>✅ WhatsApp vinculado</h2>
<p>Estado: <strong>CONNECTED</strong></p>
<p>Bot: ${number}</p>
<p>No necesitas introducir ningún código.</p>`)
  }

  if (state === 'PAIRING' && whatsappPublicState.pairingCode) {
    return page(`<h2>Vincular WhatsApp</h2>
<p>Bot: ${number}</p>
<p>Código de vinculación:</p>
<h2><code>${escapeHtml(whatsappPublicState.pairingCode)}</code></h2>
<p>WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono.</p>
<p>Esta página se actualiza automáticamente mientras esperas la vinculación.</p>`, true)
  }

  const labels: Record<string, string> = {
    STARTING: 'CHRONOS está iniciando la conexión con WhatsApp.',
    PAIRING: 'Preparando un nuevo código de vinculación.',
    RECONNECTING: 'CHRONOS está intentando reconectarse.',
    DISCONNECTED: 'WhatsApp está desconectado.',
    RATE_LIMITED: 'WhatsApp limitó temporalmente los intentos de conexión.',
    DISABLED: 'La conexión de WhatsApp está desactivada en el servidor.',
  }

  return page(`<h2>Estado de WhatsApp</h2>
<p>Bot: ${number}</p>
<p>Estado: <strong>${escapeHtml(state)}</strong></p>
<p>${escapeHtml(labels[state] ?? 'Esperando estado de WhatsApp.')}</p>
<p>Esta página se actualiza automáticamente.</p>`, true)
}

export const pairingRouter = Router()

pairingRouter.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')

  if (!env.PAIRING_PAGE_TOKEN) {
    return res.status(503).type('html').send(page('<h2>Página de vinculación desactivada</h2><p>Configura PAIRING_PAGE_TOKEN en Railway para habilitarla.</p>'))
  }

  const expectedDigest = tokenDigest(env.PAIRING_PAGE_TOKEN)
  const suppliedKey = typeof req.query.key === 'string' ? req.query.key : null

  if (suppliedKey) {
    if (!safeEqual(tokenDigest(suppliedKey), expectedDigest)) {
      return res.status(401).type('html').send(accessForm('Clave incorrecta.'))
    }

    res.cookie(COOKIE_NAME, expectedDigest, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    })
    return res.redirect('/')
  }

  const cookie = readCookie(req, COOKIE_NAME)
  if (!cookie || !safeEqual(cookie, expectedDigest)) {
    return res.status(401).type('html').send(accessForm())
  }

  return res.type('html').send(pairingStatusPage())
})
