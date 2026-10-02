import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '../utils/logger.js'

const STICKER_PATH = resolve(process.cwd(), 'assets', 'stickers', 'chronos-warning.webp')
let stickerBufferPromise: Promise<Buffer> | null = null

async function getStickerBuffer() {
  stickerBufferPromise ??= readFile(STICKER_PATH)
  return stickerBufferPromise
}

async function safeSendText(
  sock: WASocket,
  groupJid: string,
  text: string,
  mentions?: string[],
) {
  try {
    await sock.sendMessage(groupJid, mentions ? { text, mentions } : { text })
    return true
  } catch (error) {
    logger.warn({ err: error, groupJid }, 'Could not send CHRONOS moderation text')
    return false
  }
}

export async function sendChronosSticker(sock: WASocket, groupJid: string) {
  try {
    const sticker = await getStickerBuffer()
    await sock.sendMessage(groupJid, { sticker })
    return true
  } catch (error) {
    stickerBufferPromise = null
    logger.warn({ err: error, groupJid, stickerPath: STICKER_PATH }, 'Could not send CHRONOS moderation sticker')
    return false
  }
}

export async function sendAntiLinkFirstWarning(
  sock: WASocket,
  groupJid: string,
  label: string,
  mention: string,
) {
  await safeSendText(
    sock,
    groupJid,
    `⚠️ ${label}, ese contenido no está permitido.\n\nEsta vez fue el mensaje.\nA la próxima...`,
    [mention],
  )
  await sendChronosSticker(sock, groupJid)
}

export async function sendAntiLinkRemovalFeedback(sock: WASocket, groupJid: string) {
  await sendChronosSticker(sock, groupJid)
  await safeSendText(sock, groupJid, 'Te lo dije. 👋')
}

export async function sendAntiBotRemovalFeedback(sock: WASocket, groupJid: string) {
  await safeSendText(
    sock,
    groupJid,
    '🤖 CHRONOS — Bot no autorizado detectado\n\nAcceso eliminado.\n\nAquí ya hay quien cuide la casa. 👋',
  )
  await sendChronosSticker(sock, groupJid)
}
