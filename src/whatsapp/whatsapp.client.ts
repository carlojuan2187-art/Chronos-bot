import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import type { WASocket } from '@whiskeysockets/baileys'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { whatsappPublicState } from './state.js'
import { registerWhatsAppEvents } from './whatsapp.events.js'

const require = createRequire(import.meta.url)
const pairingEngine = require('../../pairing-engine.cjs') as {
  start: (options?: unknown) => Promise<WASocket>
  stop: () => Promise<void>
  getSocket: () => WASocket | null
  resetSessionAndReconnect: () => Promise<WASocket>
}

let connectedSocket: WASocket | null = null
let stopping = false
let listenersSocket: WASocket | null = null
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

function mergePublicState(next: Partial<typeof whatsappPublicState>) {
  Object.assign(whatsappPublicState, next)
}

export async function startWhatsApp() {
  if (!env.WHATSAPP_ENABLED) {
    mergePublicState({
      status: 'DISABLED',
      number: env.WHATSAPP_NUMBER,
      pairingCode: null,
      qr: null,
    })
    return
  }

  stopping = false
  listenersSocket = null
  mergePublicState({
    status: 'STARTING',
    number: env.WHATSAPP_NUMBER,
    pairingCode: null,
    qr: null,
  })

  await pairingEngine.start({
    number: env.WHATSAPP_NUMBER,
    sessionDir: env.SESSION_DIR,
    mode: env.WHATSAPP_PAIRING_MODE,
    onState: (next: Partial<typeof whatsappPublicState>) => mergePublicState(next),
    onLog: (level: string, message: string, extra?: unknown) => {
      const fn = (logger as any)[level] ?? logger.info.bind(logger)
      if (extra !== undefined) fn.call(logger, { err: extra }, message)
      else fn.call(logger, message)
    },
    onConnected: async (sock: WASocket) => {
      if (stopping) return
      connectedSocket = sock
      if (listenersSocket !== sock) {
        registerWhatsAppEvents(sock)
        listenersSocket = sock
        logger.info({ user: (sock as any).user?.id || null }, 'WhatsApp command/moderation listeners registered')
      }
      lifecycle.emit('connected')
    },
  })
}

export async function resetWhatsAppPairing() {
  connectedSocket = null
  listenersSocket = null
  mergePublicState({ status: 'STARTING', pairingCode: null, qr: null })
  await pairingEngine.resetSessionAndReconnect()
}

export async function stopWhatsApp() {
  stopping = true
  await pairingEngine.stop()
  connectedSocket = null
  listenersSocket = null
  mergePublicState({ status: 'DISCONNECTED', pairingCode: null, qr: null })
}

export async function reconnectWhatsApp() {
  await stopWhatsApp()
  stopping = false
  await startWhatsApp()
}
