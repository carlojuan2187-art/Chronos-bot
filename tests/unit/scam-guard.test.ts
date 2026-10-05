import { describe,it,expect } from 'vitest'
import { extractReportPhones,parseScamReport,maskPhone } from '../../src/scam-guard/scam-guard.parser.js'

describe('Scam Guard parser',()=>{
  it('accepts a natural trusted-admin report',()=>{
    const row=parseScamReport('Reporto +53 5857 9967 por estafa de inversión')
    expect(row?.phones).toEqual(['5358579967'])
    expect(row?.reason.toLowerCase()).toContain('estafa')
  })
  it('accepts a bare phone number in the trusted source',()=>{
    expect(parseScamReport('5351234567')?.phones).toEqual(['5351234567'])
  })
  it('does not convert unrelated text containing a number into a report',()=>{
    expect(parseScamReport('Reunión 20261005 a las 16000000')).toBeNull()
  })
  it('extracts multiple unique report numbers',()=>{
    expect(extractReportPhones('fraude +53 5123 4567 y +1 (555) 123-4567 +53 5123 4567')).toEqual(['5351234567','15551234567'])
  })
  it('masks the public identity',()=>{
    expect(maskPhone('5351234567')).toMatch(/4567$/)
    expect(maskPhone('5351234567')).not.toContain('51234567')
  })
})
