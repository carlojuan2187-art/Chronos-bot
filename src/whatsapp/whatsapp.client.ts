import fs from 'node:fs/promises'
import path from 'node:path'
import { EventEmitter } from 'node:events'
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
let activeCredsRegistered: (() => boolean) | null = null
let phonePairingRequested = false
let operationalListenersRegistered = false
const lifecycle = new EventEmitter()

export function getWhatsAppSocket() {
  return connectedSocket
}

export function requireWhatsAppSocket() {
  if (!connectedSocket || whatsappPublicState.status !== 'CONNECTED') {
    throw new Error('WHATSAPP_DISCONNECTED')
  }
  return connectedSocket
}

export function onWhatsAppConnected(listener: () => void | Promise<void>) {
  lifecycle.on('connected', listener)
  return () => lifecycle.off('connected', listener)
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
    logger.warn('Sesión inválida eliminada. Se solicitará una nueva vinculación.')
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
 * Pairing engine based on the exact socket/auth/version/browser flow from
 * Chronos-bot-pairing-fix-v2, the build that paired successfully on Railway.
 *
 * Important: we DO NOT call requestPairingCode automatically anymore. The QR
 * emitted by Baileys remains untouched and is the primary pairing method.
 * Phone-code pairing is requested only when the operator explicitly asks for it
 * from the protected pairing page.
 */
export async function startWhatsApp() {
  if (!env.WHATSAPP_ENABLED) {
    whatsappPublicState.status = 'DISABLED'
    whatsappPublicState.number = env.WHATSAPP_NUMBER
    whatsappPublicState.qr = null
    whatsappPublicState.pairingCode = null
    return
  }

  stopping = false
  whatsappPublicState.number = env.WHATSAPP_NUMBER
  whatsappPublicState.status = 'STARTING'
  whatsappPublicState.pairingCode = null
  whatsappPublicState.qr = null
  phonePairingRequested = false
  operationalListenersRegistered = false

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
  activeCredsRegistered = () => Boolean(state.creds.registered)

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

  sock.ev.on('connection.update', async (update: any) => {
    if (activeSocket !== sock) return

    const { connection, lastDisconnect, qr } = update

    // Preserve the QR exactly as Baileys gives it to us. Do not request a phone
    // pairing code automatically because that changes the registration flow.
    if (!state.creds.registered && typeof qr === 'string' && qr.length > 0) {
      whatsappPublicState.status = 'PAIRING'
      whatsappPublicState.qr = qr
      whatsappPublicState.pairingCode = null
      phonePairingRequested = false
      logger.info('WhatsApp QR listo para vincular')
    }

    if (connection === 'open') {
      connectedSocket = sock
      whatsappPublicState.status = 'CONNECTED'
      whatsappPublicState.pairingCode = null
      whatsappPublicState.qr = null
      phonePairingRequested = false

      // Only after WhatsApp confirms the session do we attach the heavy runtime
      // listeners that touch MongoDB/moderation/sync.
      if (!operationalListenersRegistered) {
        registerWhatsAppEvents(sock)
        operationalListenersRegistered = true
      }

      logger.info('✅ CHRONOS conectado a WhatsApp')
      lifecycle.emit('connected')
      return
    }

    if (connection === 'close') {
      if (connectedSocket === sock) connectedSocket = null

      whatsappPublicState.qr = null
      whatsappPublicState.pairingCode = null
      phonePairingRequested = false

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
        return
      }

      // This is the same cleanup policy used by the build that paired correctly.
      if (
        statusCode === DisconnectReason.loggedOut ||
        (noRegistrado && [405, 408, 428].includes(Number(statusCode)))
      ) {
        whatsappPublicState.status = 'PAIRING'
        await clearInvalidSession()
      } else {
        whatsappPublicState.status = 'RECONNECTING'
      }

      scheduleReconnect(4000)
    }
  })
}

/**
 * Explicit fallback for users who prefer WhatsApp's "link with phone number"
 * flow. Calling this intentionally switches the current registration attempt
 * from QR to phone-code pairing.
 */
export async function requestPhonePairingCode(): Promise<string> {
  if (!activeSocket) throw new Error('WHATSAPP_SOCKET_NOT_READY')
  if (activeCredsRegistered?.()) throw new Error('WHATSAPP_ALREADY_REGISTERED')
  if (phonePairingRequested && whatsappPublicState.pairingCode) {
    return whatsappPublicState.pairingCode
  }

  phonePairingRequested = true
  whatsappPublicState.status = 'PAIRING'
  whatsappPublicState.qr = null

  try {
    logger.info(`Pidiendo código para: ${env.WHATSAPP_NUMBER}`)
    const code = await activeSocket.requestPairingCode(env.WHATSAPP_NUMBER)
    whatsappPublicState.pairingCode = code
    logger.info(`CÓDIGO WHATSAPP: ${code}`)
    return code
  } catch (error) {
    phonePairingRequested = false
    whatsappPublicState.pairingCode = null
    throw error
  }
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
  activeCredsRegistered = null
  phonePairingRequested = false
  operationalListenersRegistered = false
  whatsappPublicState.pairingCode = null
  whatsappPublicState.qr = null
  whatsappPublicState.status = 'DISCONNECTED'
}

export async function reconnectWhatsApp() {
  await stopWhatsApp()
  stopping = false
  await startWhatsApp()
}
