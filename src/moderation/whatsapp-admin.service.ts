import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { participantJids, sameUserJid, uniqueJids } from '../utils/jid.js'

function senderJids(msg: WAMessage) {
  const key: any = msg.key
  return uniqueJids([
    key?.participant,
    key?.participantPn,
    key?.participantLid,
    key?.senderPn,
    key?.senderLid,
  ])
}

function matchesAny(candidateJids: string[], sender: string[]) {
  return candidateJids.some(candidate => sender.some(value => candidate === value || sameUserJid(candidate, value)))
}

export function senderIsAdminInMetadata(meta: any, msg: WAMessage) {
  const sender = senderJids(msg)
  if (sender.length === 0) return false

  const ownerJids = uniqueJids([meta?.owner, meta?.ownerJid])
  if (matchesAny(ownerJids, sender)) return true

  return Boolean(meta?.participants?.some((participant: any) => {
    const isAdmin = Boolean(participant?.admin || participant?.isAdmin || participant?.isSuperAdmin)
    return isAdmin && matchesAny(participantJids(participant), sender)
  }))
}

/**
 * WhatsApp-level moderation exemption for anti-link only.
 *
 * - Group admins can be allowed independently.
 * - If the group belongs to a WhatsApp Community, parent-community admins can
 *   also be allowed independently through the linkedParent metadata.
 * - This does not grant CHRONOS panel permissions or command permissions.
 */
export async function canWhatsAppAdminBypassAntiLink(sock: WASocket, msg: WAMessage, cfg: any) {
  const allowGroupAdmins = cfg?.allowGroupAdmins !== false
  const allowCommunityAdmins = cfg?.allowCommunityAdmins !== false
  if (!allowGroupAdmins && !allowCommunityAdmins) return false

  const groupJid = msg.key.remoteJid
  if (!groupJid?.endsWith('@g.us')) return false

  try {
    const meta: any = await sock.groupMetadata(groupJid)
    if (allowGroupAdmins && senderIsAdminInMetadata(meta, msg)) return true

    const parentJid = meta?.linkedParent
    if (allowCommunityAdmins && typeof parentJid === 'string' && parentJid.endsWith('@g.us')) {
      try {
        const parentMeta: any = await sock.groupMetadata(parentJid)
        if (senderIsAdminInMetadata(parentMeta, msg)) return true
      } catch {
        // If parent metadata is temporarily unavailable, group-admin detection
        // still remains valid. Do not make moderation fail because of it.
      }
    }
  } catch {
    // A metadata lookup failure must never break the message pipeline.
  }

  return false
}
