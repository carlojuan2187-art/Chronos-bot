export type WhatsAppPublicState = {
  status: 'STARTING' | 'PAIRING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'RATE_LIMITED' | 'DISABLED'
  pairingCode: string | null
  qr: string | null
  number: string
}

export const whatsappPublicState: WhatsAppPublicState = {
  status: 'STARTING',
  pairingCode: null,
  qr: null,
  number: '',
}
