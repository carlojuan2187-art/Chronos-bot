import { beforeEach,describe,expect,it } from 'vitest'
import { detectUnauthorizedBot,resetAntiBotHistory } from '../../src/moderation/anti-bot.service.js'

const cfg={enabled:true,scoreThreshold:4,repeatThreshold:2,repeatWindowSeconds:600,detectModerationWarnings:true,detectAutomationLanguage:true,customSignatures:[]}

describe('anti-bot detector',()=>{
  beforeEach(()=>resetAntiBotHistory())
  it('ignores normal conversation',()=>{
    expect(detectUnauthorizedBot('g:u','Hola equipo, ¿cómo están?',cfg)).toBeNull()
  })
  it('detects a structured automatic moderation warning',()=>{
    const result=detectUnauthorizedBot('g:u','⚠️ Advertencia 1/3. No está permitido enviar enlaces. Mensaje eliminado.',cfg)
    expect(result).not.toBeNull()
    expect(result!.score).toBeGreaterThanOrEqual(4)
  })
  it('detects configured signatures immediately',()=>{
    const result=detectUnauthorizedBot('g:u','Respuesta automática del guardián',{...cfg,customSignatures:['respuesta automática del guardián']})
    expect(result?.signals).toContain('CUSTOM_SIGNATURE')
  })
  it('does not kick a normal user only for repeating a neutral message',()=>{
    expect(detectUnauthorizedBot('g:u','Mensaje estándar de servicio',cfg)).toBeNull()
    expect(detectUnauthorizedBot('g:u','Mensaje estándar de servicio',cfg)).toBeNull()
  })
})
