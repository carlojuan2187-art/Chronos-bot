export function normalizePhone(value: string) { return value.replace(/\D/g, '') }
export function phoneFromJid(jid?: string | null) { return jid ? jid.split('@')[0]?.replace(/\D/g,'') ?? '' : '' }
export function isGroupJid(jid?: string | null) { return Boolean(jid?.endsWith('@g.us')) }

/**
 * WhatsApp Multi-Device may identify a participant by LID instead of by the
 * phone-number JID. Baileys exposes the PN identity separately when available
 * (participantPn/senderPn). Always prefer those values for authorization and
 * only fall back to participant/remoteJid for older message shapes.
 */
export function phoneCandidatesFromMessageKey(key: any): string[] {
  const raw = [key?.participantPn, key?.senderPn, key?.participant, key?.remoteJid]
  const phones: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string' || value.endsWith('@g.us')) continue
    const phone = phoneFromJid(value)
    if (phone && !phones.includes(phone)) phones.push(phone)
  }
  return phones
}
