export function normalizePhone(value: string) { return value.replace(/\D/g, '') }

export function phoneFromJid(jid?: string | null) {
  if (!jid) return ''
  const user = jid.split('@')[0]?.split(':')[0] ?? ''
  return user.replace(/\D/g, '')
}

export function isGroupJid(jid?: string | null) { return Boolean(jid?.endsWith('@g.us')) }
export function isPhoneJid(jid?: string | null) { return Boolean(jid?.endsWith('@s.whatsapp.net')) }
export function isLidJid(jid?: string | null) { return Boolean(jid?.endsWith('@lid')) }

/**
 * Compares two WhatsApp identities without treating a LID as a phone-number JID.
 * Device suffixes such as `12345:7@s.whatsapp.net` are ignored for PN identities.
 */
export function sameUserJid(a?: string | null, b?: string | null) {
  if (!a || !b) return false
  if (a === b) return true
  if (isPhoneJid(a) && isPhoneJid(b)) return phoneFromJid(a) === phoneFromJid(b)
  return false
}

export function uniqueJids(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))]
}

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
    if (typeof value !== 'string' || value.endsWith('@g.us') || !isPhoneJid(value)) continue
    const phone = phoneFromJid(value)
    if (phone && !phones.includes(phone)) phones.push(phone)
  }
  return phones
}

export function participantJids(participant: any) {
  return uniqueJids([participant?.id, participant?.jid, participant?.lid])
}

export function participantMatchesJid(participant: any, jid?: string | null) {
  if (!jid) return false
  return participantJids(participant).some(candidate => candidate === jid || sameUserJid(candidate, jid))
}
