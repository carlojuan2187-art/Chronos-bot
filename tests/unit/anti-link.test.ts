import { describe,it,expect } from 'vitest'
import { detectsBlockedLink } from '../../src/moderation/anti-link.service.js'
const cfg={enabled:true,detectHttpLinks:true,detectWhatsAppLinks:true,detectTelegramLinks:true,detectPhoneNumbers:true,detectObfuscatedLinks:true}
describe('anti-link',()=>{it('detects normal links',()=>expect(detectsBlockedLink('mira https://example.com',cfg)).toBe(true));it('detects obfuscated telegram',()=>expect(detectsBlockedLink('entra a t punto me / canal',cfg)).toBe(true));it('allows normal trading chat',()=>expect(detectsBlockedLink('BTC rompe resistencia, ojo con el volumen',cfg)).toBe(false))})
