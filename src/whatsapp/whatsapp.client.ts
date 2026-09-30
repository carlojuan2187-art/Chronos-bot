import fs from 'node:fs/promises'
import path from 'node:path'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { whatsappPublicState } from './state.js'
import { registerWhatsAppEvents } from './whatsapp.events.js'

let activeSocket: WASocket | null = null
let connectedSocket: WASocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let stopping = false

export function getWhatsAppSocket() {
  return connectedSocket
}

export function requireWhatsAppSocket() {
  if (!connectedSocket || whatsappPublicState.status !== 'CONNECTED') {
    throw new Error('WHATSAPP_DISCONNECTED')
  }
  return connectedSocket
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function clearInvalidSession() {
  try {
    await fs.rm(path.resolve(env.SESSION_DIR), { recursive: true, force: true })
    logger.warn('Sesión inválida eliminada. Se solicitará un nuevo código.')
  } catch (error) {
    logger.error({ err: error }, 'No se pudo limpiar la sesión inválida')
  }
}

function getDisconnectCode(lastDisconnect: any) {
  return (
    lastDisconnect?.error?.output?.statusCode ||
    lastDisconnect?.error?.statusCode ||
    lastDisconnect?.error?.data?.statusCode ||
    null
  )
}

function scheduleReconnect(delayMs = 3000) {
  if (stopping || reconnectTimer) return

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    startWhatsApp().catch((error) => {
      logger.error({ err: error }, 'Error reiniciando CHRONOS')
      whatsappPublicState.status = 'RECONNECTING'
      scheduleReconnect(5000)
    })
  }, delayMs)
}

/**
 * WhatsApp connection engine intentionally mirrors the exact registration flow
 * from Chronos-bot-pairing-fix-v2, the build that paired successfully on Railway.
 * Do not add database/scheduler work to the registration callbacks.
 */
export async function startWhatsApp() {
  if (!env.WHATSAPP_ENABLED) {
    whatsappPublicState.status = 'DISABLED'
    whatsappPublicState.number = env.WHATSAPP_NUMBER
    return
  }

  stopping = false
  whatsappPublicState.number = env.WHATSAPP_NUMBER
  whatsappPublicState.status = 'STARTING'
  whatsappPublicState.pairingCode = null

  // Keep the invocation semantics of the known-good v2 build: no argument.
  let versionInfo: any
  if (typeof fetchLatestWaWebVersion === 'function') {
    versionInfo = await (fetchLatestWaWebVersion as unknown as () => Promise<any>)()
  }

  if (!versionInfo?.isLatest) {
    logger.warn('No se pudo obtener WA Web live; usando fallback de Baileys.')
    versionInfo = await fetchLatestBaileysVersion()
  }

  const { version, isLatest } = versionInfo
  logger.info(`WhatsApp Web version: ${version.join('.')} | latest=${String(isLatest)}`)

  const sessionDir = path.resolve(env.SESSION_DIR)
  const hadStoredCreds = await fileExists(path.join(sessionDir, 'creds.json'))
  let authBundle = await useMultiFileAuthState(sessionDir)

  if (hadStoredCreds && !authBundle.state.creds.registered) {
    logger.warn('Detectada sesión parcial no registrada. Limpiando antes de vincular...')
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
  connectedSocket = null
  sock.ev.on('creds.update', saveCreds)

  // The known-good build attached its operational listeners immediately after
  // creating the socket. Keep that ordering. They cannot process normal traffic
  // until WhatsApp is connected.
  registerWhatsAppEvents(sock)

  sock.ev.on('connection.update', async (update: any) => {
    if (activeSocket !== sock) return

    const { connection, lastDisconnect, qr } = update

    if (!state.creds.registered && !pairingRequested && Boolean(qr)) {
      pairingRequested = true
      whatsappPublicState.status = 'PAIRING'
      whatsappPublicState.pairingCode = null

      try {
        logger.info(`Pidiendo código para: ${env.WHATSAPP_NUMBER}`)
        const code = await sock.requestPairingCode(env.WHATSAPP_NUMBER)
        whatsappPublicState.pairingCode = code
        logger.info(`CÓDIGO WHATSAPP: ${code}`)
      } catch (error: any) {
        pairingRequested = false
        const statusCode = error?.output?.statusCode || error?.statusCode || 'sin código'
        logger.error({ err: error }, `Error solicitando pairing code: ${statusCode}`)
        whatsappPublicState.pairingCode = null
        whatsappPublicState.status = 'DISCONNECTED'
      }
    }

    if (connection === 'open') {
      connectedSocket = sock
      whatsappPublicState.status = 'CONNECTED'
      whatsappPublicState.pairingCode = null
      logger.info('✅ CHRONOS conectado a WhatsApp')
      return
    }

    if (connection === 'close') {
      if (connectedSocket === sock) connectedSocket = null

      const statusCode = getDisconnectCode(lastDisconnect)
      const message = lastDisconnect?.error?.message || 'sin mensaje'
      const noRegistrado = !state.creds.registered

      logger.error(
        `WhatsApp cerró la conexión. status=${statusCode ?? 'N/A'} registered=${String(
          state.creds.registered,
        )} message=${message}`,
      )

      if (statusCode === 429) {
        whatsappPublicState.status = 'RATE_LIMITED'
        whatsappPublicState.pairingCode = null
        return
      }

      // Exact known-good v2 behavior: only clear on loggedOut or the specific
      // unregistered registration failures below. In particular, do NOT clear
      // credentials on 515 here; the previous working build did not do that.
      if (
        statusCode === DisconnectReason.loggedOut ||
        (noRegistrado && [405, 408, 428].includes(Number(statusCode)))
      ) {
        whatsappPublicState.status = 'PAIRING'
        whatsappPublicState.pairingCode = null
        await clearInvalidSession()
      } else {
        whatsappPublicState.status = 'RECONNECTING'
        whatsappPublicState.pairingCode = null
      }

      scheduleReconnect(4000)
    }
  })
}

export async function stopWhatsApp() {
  stopping = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  try {
    activeSocket?.end(undefined)
  } catch {
    // Ignore shutdown errors.
  }

  activeSocket = null
  connectedSocket = null
  whatsappPublicState.pairingCode = null
  whatsappPublicState.status = 'DISCONNECTED'
}

export async function reconnectWhatsApp() {
  await stopWhatsApp()
  stopping = false
  await startWhatsApp()
}
