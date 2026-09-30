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
import { SystemState } from '../system/system-state.model.js'

let activeSocket: WASocket | null = null
let connectedSocket: WASocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let stopping = false

/**
 * IMPORTANT:
 * Only expose the socket to the rest of CHRONOS after WhatsApp reports
 * connection === 'open'. Pairing/registration uses activeSocket internally,
 * but background workers must not issue group/message queries during registration.
 */
export function getWhatsAppSocket() {
  return connectedSocket
}

export function requireWhatsAppSocket() {
  if (!connectedSocket || whatsappPublicState.status !== 'CONNECTED') {
    throw new Error('WHATSAPP_DISCONNECTED')
  }
  return connectedSocket
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function clearSession() {
  await fs.rm(path.resolve(env.SESSION_DIR), { recursive: true, force: true })
}

function disconnectCode(lastDisconnect: any) {
  return (
    lastDisconnect?.error?.output?.statusCode ||
    lastDisconnect?.error?.statusCode ||
    lastDisconnect?.error?.data?.statusCode ||
    null
  )
}

function scheduleReconnect(ms = 4000) {
  if (stopping || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    startWhatsApp().catch((error) => {
      logger.error({ err: error }, 'WhatsApp restart failed')
      scheduleReconnect(5000)
    })
  }, ms)
}

export async function startWhatsApp() {
  if (!env.WHATSAPP_ENABLED) {
    whatsappPublicState.status = 'DISABLED'
    whatsappPublicState.number = env.WHATSAPP_NUMBER
    return
  }

  stopping = false
  whatsappPublicState.number = env.WHATSAPP_NUMBER
  whatsappPublicState.pairingCode = null

  // Keep the same pairing strategy that was proven to work in Chronos-bot-pairing-fix-v2.
  // Baileys 6.7.24 types require an argument, but an empty options object is runtime-equivalent
  // to the previously working no-argument call.
  let versionInfo =
    typeof fetchLatestWaWebVersion === 'function'
      ? await fetchLatestWaWebVersion({})
      : undefined

  if (!versionInfo?.isLatest) {
    logger.warn('Could not resolve live WhatsApp Web version; using Baileys fallback')
    versionInfo = await fetchLatestBaileysVersion()
  }

  logger.info(
    `Starting WhatsApp registration with version ${versionInfo.version.join('.')} for ${env.WHATSAPP_NUMBER}`,
  )

  const sessionDir = path.resolve(env.SESSION_DIR)
  const hadSession = await exists(path.join(sessionDir, 'creds.json'))
  let authBundle = await useMultiFileAuthState(sessionDir)

  if (hadSession && !authBundle.state.creds.registered) {
    logger.warn('Partial WhatsApp session found; clearing it before pairing')
    await clearSession()
    authBundle = await useMultiFileAuthState(sessionDir)
  }

  const { state, saveCreds } = authBundle
  let pairingRequested = false
  let operationalEventsRegistered = false

  const socket = makeWASocket({
    version: versionInfo.version,
    auth: state,
    browser: Browsers.macOS('Chrome'),
    printQRInTerminal: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  })

  activeSocket = socket
  connectedSocket = null
  socket.ev.on('creds.update', saveCreds)

  socket.ev.on('connection.update', async (update: any) => {
    if (activeSocket !== socket) return

    const { connection, lastDisconnect, qr } = update

    // Request exactly one phone-number pairing code per registration socket,
    // and only after Baileys has received the QR event (registration channel ready).
    if (!state.creds.registered && !pairingRequested && Boolean(qr)) {
      pairingRequested = true
      whatsappPublicState.status = 'PAIRING'
      whatsappPublicState.pairingCode = null

      try {
        const code = await socket.requestPairingCode(env.WHATSAPP_NUMBER)
        whatsappPublicState.pairingCode = code
        // Keep the code in the text message too: Railway's compact log view can hide structured fields.
        logger.info(`WhatsApp pairing code generated: ${code}`)
      } catch (error: any) {
        pairingRequested = false
        whatsappPublicState.pairingCode = null
        const statusCode =
          error?.output?.statusCode || error?.statusCode || error?.data?.statusCode || 'N/A'
        logger.error({ err: error }, `Pairing code failed with status ${statusCode}`)
      }
    }

    if (connection === 'open') {
      connectedSocket = socket
      whatsappPublicState.status = 'CONNECTED'
      whatsappPublicState.pairingCode = null

      // Do not register moderation/group handlers until registration is completely finished.
      if (!operationalEventsRegistered) {
        operationalEventsRegistered = true
        registerWhatsAppEvents(socket)
      }

      await SystemState.findByIdAndUpdate(
        'singleton',
        {
          $set: {
            whatsappStatus: 'CONNECTED',
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )

      logger.info('CHRONOS connected to WhatsApp')
      return
    }

    if (connection === 'close') {
      if (connectedSocket === socket) connectedSocket = null
      activeSocket = null

      // Never keep showing a code that belongs to a closed registration socket.
      whatsappPublicState.pairingCode = null

      const statusCode = disconnectCode(lastDisconnect)
      const unregistered = !state.creds.registered
      const message = lastDisconnect?.error?.message || 'sin mensaje'

      await SystemState.findByIdAndUpdate(
        'singleton',
        {
          $set: {
            whatsappStatus: 'DISCONNECTED',
            lastDisconnectedAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )

      logger.warn(
        `WhatsApp connection closed. status=${statusCode ?? 'N/A'} registered=${String(
          state.creds.registered,
        )} message=${message}`,
      )

      if (statusCode === 429) {
        whatsappPublicState.status = 'RATE_LIMITED'
        return
      }

      // 515 = restartRequired. After a successful pairing this is expected and the
      // credentials must be preserved. If registration never completed, remove the
      // partial state before trying a fresh code.
      if (statusCode === DisconnectReason.restartRequired) {
        if (state.creds.registered) {
          whatsappPublicState.status = 'RECONNECTING'
          scheduleReconnect(1500)
          return
        }

        logger.warn('RestartRequired received before registration completed; clearing partial pairing state')
        await clearSession()
        whatsappPublicState.status = 'PAIRING'
        scheduleReconnect(4000)
        return
      }

      if (
        statusCode === DisconnectReason.loggedOut ||
        (unregistered && [405, 408, 428].includes(Number(statusCode)))
      ) {
        await clearSession()
        whatsappPublicState.status = 'PAIRING'
      } else {
        whatsappPublicState.status = 'RECONNECTING'
      }

      scheduleReconnect()
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
