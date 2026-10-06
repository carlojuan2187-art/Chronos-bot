import { describe,expect,it } from 'vitest'
import { scamPhoneAliases,sameScamPhone } from '../../src/scam-guard/scam-identity.js'

describe('Scam Guard phone identity',()=>{
  it('matches the Mexican WhatsApp identity in the incident in both directions',()=>{
    expect(scamPhoneAliases('5213313412151')).toEqual(['5213313412151','523313412151'])
    expect(sameScamPhone('+52 33 1341 2151','5213313412151')).toBe(true)
    expect(sameScamPhone('5213313412151','523313412151')).toBe(true)
  })
  it('never guesses country codes or matches only a suffix',()=>{
    expect(sameScamPhone('3313412151','5213313412151')).toBe(false)
    expect(sameScamPhone('153313412151','523313412151')).toBe(false)
    expect(sameScamPhone('5213313412152','523313412151')).toBe(false)
  })
  it('does not strip digits from a LID to invent a phone',()=>{
    expect(scamPhoneAliases('2057994023048@lid')).toEqual([])
    expect(sameScamPhone('2057994023048@lid','2057994023048')).toBe(false)
  })
  it('keeps other countries and malformed Mexican lengths distinct',()=>{
    expect(scamPhoneAliases('5351234567')).toEqual(['5351234567'])
    expect(scamPhoneAliases('52123456789')).toEqual(['52123456789'])
  })
})
