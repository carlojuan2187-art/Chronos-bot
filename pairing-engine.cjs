const fs = require('fs/promises')
const path = require('path')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  Browsers,
} = require('@whiskeysockets/baileys')

let activeSocket = null
let reconnectTimer = null
let stopping = false
let options = null

function log(level, message, extra) {
  try {
    if (typeof options?.onLog === 'function') options.onLog(level, message, extra)
    else if (extra !== undefined) console[level]?.(message, extra)
    else console[level]?.(message)
  } catch {}
}

function getDisconnectCode(lastDisconnect) {
  return (
    lastDisconnect?.error?.output?.statusCode ||
    lastDisconnect?.error?.statusCode ||
    lastDisconnect?.error?.data?.statusCode ||
    null
  )
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function clearInvalidSession() {
  if (!options) return
  try {
    await fs.rm(path.resolve(options.sessionDir), { recursive: true, force: true })
    log('warn', 'Sesión inválida eliminada. Se solicitará una nueva vinculación.')
  } catch (error) {
    log('error', 'No se pudo limpiar la sesión inválida', error)
  }
}

function scheduleReconnect(delayMs = 4000) {
  if (stopping || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    start().catch((error) => {
      log('error', 'Error reiniciando CHRONOS', error)
      try { options?.onState?.({ status: 'RECONNECTING', pairingCode: null, qr: null }) } catch {}
      scheduleReconnect(5000)
    })
  }, delayMs)
}

async function start(startOptions) {
  if (startOptions) options = startOptions
  if (!options) throw new Error('PAIRING_ENGINE_OPTIONS_REQUIRED')

  const number = String(options.number || '').replace(/\D/g, '')
  if (!/^\d{8,15}$/.test(number)) {
    throw new Error('WHATSAPP_NUMBER debe estar en formato E.164 sin +, espacios ni guiones.')
  }

  stopping = false
  options.onState?.({ status: 'STARTING', pairingCode: null, qr: null })

  let versionInfo
  if (typeof fetchLatestWaWebVersion === 'function') {
    versionInfo = await fetchLatestWaWebVersion()
  }
  if (!versionInfo?.isLatest) {
    log('warn', 'No se pudo obtener WA Web live; usando fallback de Baileys.')
    versionInfo = await fetchLatestBaileysVersion()
  }

  const { version, isLatest } = versionInfo
  log('info', `WhatsApp Web version: ${version.join('.')} | latest=${isLatest}`)

  const sessionDir = path.resolve(options.sessionDir)
  const hadStoredCreds = await fileExists(path.join(sessionDir, 'creds.json'))
  let authBundle = await useMultiFileAuthState(sessionDir)

  if (hadStoredCreds && !authBundle.state.creds.registered) {
    log('warn', 'Detectada sesión parcial no registrada. Limpiando antes de vincular...')
    await clearInvalidSession()
    authBundle = await useMultiFileAuthState(sessionDir)
  }

  const { state, saveCreds } = authBundle
  let pairingRequested = false

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('Chrome'),
    printQRInTerminal: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  })

  activeSocket = sock
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    if (activeSocket !== sock) return
    const { connection, lastDisconnect, qr } = update

    if (!state.creds.registered && !pairingRequested && Boolean(qr)) {
      if (options.mode === 'qr') {
        options.onState?.({ status: 'PAIRING', pairingCode: null, qr: String(qr) })
        log('info', 'QR WhatsApp listo para vincular')
      } else {
        pairingRequested = true
        options.onState?.({ status: 'PAIRING', pairingCode: null, qr: null })
        try {
          log('info', `Pidiendo código para: ${number}`)
          const code = await sock.requestPairingCode(number)
          options.onState?.({ status: 'PAIRING', pairingCode: code, qr: null })
          log('info', `CÓDIGO WHATSAPP: ${code}`)
        } catch (error) {
          pairingRequested = false
          const statusCode = error?.output?.statusCode || error?.statusCode || 'sin código'
          log('error', `Error solicitando pairing code: ${statusCode}`, error)
          options.onState?.({ status: 'DISCONNECTED', pairingCode: null, qr: null, error: String(error?.message || error) })
        }
      }
    }

    if (connection === 'open') {
      options.onState?.({ status: 'CONNECTED', pairingCode: null, qr: null })
      log('info', '✅ CHRONOS conectado a WhatsApp')
      try { await options.onConnected?.(sock) } catch (error) { log('error', 'Error activando runtime después de conectar', error) }
      return
    }

    if (connection === 'close') {
      options.onState?.({ pairingCode: null, qr: null })
      const statusCode = getDisconnectCode(lastDisconnect)
      const message = lastDisconnect?.error?.message || 'sin mensaje'
      const noRegistrado = !state.creds.registered
      log('error', `WhatsApp cerró la conexión. status=${statusCode ?? 'N/A'} registered=${state.creds.registered} message=${message}`)

      if (statusCode === 429) {
        options.onState?.({ status: 'RATE_LIMITED', pairingCode: null, qr: null })
        return
      }

      if (statusCode === DisconnectReason.loggedOut || (noRegistrado && [405, 408, 428].includes(Number(statusCode)))) {
        options.onState?.({ status: 'PAIRING', pairingCode: null, qr: null })
        await clearInvalidSession()
      } else {
        options.onState?.({ status: 'RECONNECTING', pairingCode: null, qr: null })
      }

      scheduleReconnect(4000)
    }
  })

  return sock
}

async function stop() {
  stopping = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  try { activeSocket?.end(undefined) } catch {}
  activeSocket = null
}

function getSocket() {
  return activeSocket
}

async function resetSessionAndReconnect() {
  await stop()
  stopping = false
  await clearInvalidSession()
  return start()
}

module.exports = { start, stop, getSocket, resetSessionAndReconnect }
