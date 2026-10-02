import { describe,it,expect } from 'vitest'
import { senderIsAdminInMetadata } from '../../src/moderation/whatsapp-admin.service.js'

const message=(participant:string,participantPn?:string,participantLid?:string)=>({key:{remoteJid:'123@g.us',participant,participantPn,participantLid}} as any)

describe('WhatsApp admin anti-link bypass',()=>{
  it('recognizes a group admin by PN',()=>{
    const meta={participants:[{id:'15551234567@s.whatsapp.net',jid:'15551234567@s.whatsapp.net',admin:'admin'}]}
    expect(senderIsAdminInMetadata(meta,message('999@lid','15551234567@s.whatsapp.net'))).toBe(true)
  })
  it('recognizes a group admin by LID',()=>{
    const meta={participants:[{id:'999@lid',lid:'999@lid',admin:'admin'}]}
    expect(senderIsAdminInMetadata(meta,message('999@lid',undefined,'999@lid'))).toBe(true)
  })
  it('does not exempt a normal member',()=>{
    const meta={participants:[{id:'999@lid',lid:'999@lid',admin:null}]}
    expect(senderIsAdminInMetadata(meta,message('999@lid',undefined,'999@lid'))).toBe(false)
  })
})
