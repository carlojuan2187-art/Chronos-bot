import { describe,it,expect } from 'vitest'
import { detectsBlockedLink } from '../../src/moderation/anti-link.service.js'

const cfg={enabled:true,detectHttpLinks:true,detectBareDomains:true,detectWhatsAppLinks:true,detectTelegramLinks:true,detectPhoneNumbers:true,detectObfuscatedLinks:true}

describe('anti-link',()=>{
  it('detects normal links',()=>expect(detectsBlockedLink('mira https://example.com',cfg)).toBe(true))
  it('detects naked domains',()=>expect(detectsBlockedLink('Meresingoenlosbots.com',cfg)).toBe(true))
  it('can allow naked domains per group',()=>expect(detectsBlockedLink('Meresingoenlosbots.com',{...cfg,detectBareDomains:false})).toBe(false))
  it('can allow phone references per group',()=>expect(detectsBlockedLink('escríbeme al +1 517 297 5993',{...cfg,detectPhoneNumbers:false})).toBe(false))
  it('detects naked domains with path',()=>expect(detectsBlockedLink('visita:example.net/canal',cfg)).toBe(true))
  it('detects obfuscated telegram',()=>expect(detectsBlockedLink('entra a t punto me / canal',cfg)).toBe(true))
  it('does not treat an email as a naked link',()=>expect(detectsBlockedLink('correo soporte@example.com',cfg)).toBe(false))
  it('does not treat decimals as links',()=>expect(detectsBlockedLink('BTC subió 1.25 por ciento',cfg)).toBe(false))
  it('allows normal trading chat',()=>expect(detectsBlockedLink('BTC rompe resistencia, ojo con el volumen',cfg)).toBe(false))
})
