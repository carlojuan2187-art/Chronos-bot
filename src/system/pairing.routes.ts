import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request } from 'express'
import QRCode from 'qrcode'
import { env } from '../config/env.js'
import { whatsappPublicState } from '../whatsapp/state.js'
import { requestPhonePairingCode } from '../whatsapp/whatsapp.client.js'

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
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07090c;color:#f4f7fb;font-family:Arial,sans-serif}.wrap{max-width:620px;margin:0 auto;padding:36px 18px}.card{background:#11151b;border:1px solid #232b35;border-radius:18px;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.32)}h1{margin:0 0 22px;font-size:25px}h2{margin:10px 0 14px}.muted{color:#9ba8b7}.qr{display:block;width:min(340px,100%);height:auto;margin:22px auto;background:#fff;border-radius:16px;padding:14px}code{font-size:30px;letter-spacing:3px;font-weight:700}.btn,input{width:100%;padding:14px 16px;border-radius:12px;font-size:16px}.btn{border:0;background:#20c77a;color:#04130c;font-weight:700;cursor:pointer;margin-top:10px}.secondary{background:#202833;color:#fff;border:1px solid #34404e}input{background:#0a0d11;color:#fff;border:1px solid #34404e;margin:8px 0}.sep{height:1px;background:#26303a;margin:25px 0}.ok{color:#58dd9a}.warn{color:#ffd36b}</style>
</head>
<body><div class="wrap"><div class="card"><h1>CHRONOS · WhatsApp</h1>${body}</div></div></body>
</html>`
}

function accessForm(message = ''): string {
  const warning = message ? `<p class="warn"><strong>${escapeHtml(message)}</strong></p>` : ''
  return page(`${warning}
<p class="muted">Introduce la clave privada de vinculación configurada en Railway.</p>
<form method="get" action="/">
<input name="key" type="password" autocomplete="current-password" required placeholder="Clave de acceso">
<button class="btn" type="submit">Entrar</button>
</form>`)
}

function isAuthorized(req: Request): boolean {
  if (!env.PAIRING_PAGE_TOKEN) return false
  const expectedDigest = tokenDigest(env.PAIRING_PAGE_TOKEN)
  const cookie = readCookie(req, COOKIE_NAME)
  return Boolean(cookie && safeEqual(cookie, expectedDigest))
}

async function pairingStatusPage(): Promise<string> {
  const state = whatsappPublicState.status
  const number = escapeHtml(whatsappPublicState.number || 'No configurado')

  if (state === 'CONNECTED') {
    return page(`<h2 class="ok">✅ WhatsApp vinculado</h2>
<p>Estado: <strong>CONNECTED</strong></p>
<p>Bot: ${number}</p>
<p class="muted">La sesión quedó registrada. No necesitas generar otro código.</p>`)
  }

  if (state === 'PAIRING' && whatsappPublicState.qr) {
    const dataUrl = await QRCode.toDataURL(whatsappPublicState.qr, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

    return page(`<h2>Escanea el QR</h2>
<p>Bot: ${number}</p>
<img class="qr" src="${dataUrl}" alt="QR de vinculación de WhatsApp">
<p><strong>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</strong></p>
<p class="muted">Escanea este QR directamente. No uses “Vincular con número de teléfono” para este método.</p>
<div class="sep"></div>
<p class="muted">Si prefieres usar el código por número de teléfono, puedes cambiar manualmente a ese método:</p>
<form method="post" action="/pairing/code"><button class="btn secondary" type="submit">Generar código por número</button></form>
<p class="muted">El QR se actualiza automáticamente si WhatsApp genera uno nuevo.</p>`, true)
  }

  if (state === 'PAIRING' && whatsappPublicState.pairingCode) {
    return page(`<h2>Vincular con número de teléfono</h2>
<p>Bot: ${number}</p>
<p>Código:</p>
<p><code>${escapeHtml(whatsappPublicState.pairingCode)}</code></p>
<p><strong>WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono</strong></p>
<p class="muted">Este código pertenece al socket activo. Si la conexión cambia, la página dejará de mostrarlo.</p>`, true)
  }

  const labels: Record<string, string> = {
    STARTING: 'CHRONOS está iniciando la conexión con WhatsApp.',
    PAIRING: 'Esperando que WhatsApp entregue un QR nuevo.',
    RECONNECTING: 'CHRONOS está intentando reconectarse.',
    DISCONNECTED: 'WhatsApp está desconectado.',
    RATE_LIMITED: 'WhatsApp limitó temporalmente los intentos de conexión.',
    DISABLED: 'La conexión de WhatsApp está desactivada en el servidor.',
  }

  return page(`<h2>Estado de WhatsApp</h2>
<p>Bot: ${number}</p>
<p>Estado: <strong>${escapeHtml(state)}</strong></p>
<p class="muted">${escapeHtml(labels[state] ?? 'Esperando estado de WhatsApp.')}</p>`, true)
}

export const pairingRouter = Router()

pairingRouter.get('/', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')

    if (!env.PAIRING_PAGE_TOKEN) {
      return res.status(503).type('html').send(page('<h2>Página de vinculación desactivada</h2><p>Configura PAIRING_PAGE_TOKEN en Railway.</p>'))
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

    if (!isAuthorized(req)) {
      return res.status(401).type('html').send(accessForm())
    }

    return res.type('html').send(await pairingStatusPage())
  } catch (error) {
    return next(error)
  }
})

pairingRouter.post('/pairing/code', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    if (!isAuthorized(req)) return res.status(401).type('html').send(accessForm())

    await requestPhonePairingCode()
    return res.redirect('/')
  } catch (error) {
    return next(error)
  }
})
