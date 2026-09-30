export function normalizePhone(value: string) { return value.replace(/\D/g, '') }
export function phoneFromJid(jid?: string | null) { return jid ? jid.split('@')[0]?.replace(/\D/g,'') ?? '' : '' }
export function isGroupJid(jid?: string | null) { return Boolean(jid?.endsWith('@g.us')) }
