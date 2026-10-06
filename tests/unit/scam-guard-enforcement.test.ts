import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
const m=vi.hoisted(()=>({
  config:vi.fn(),exists:vi.fn(),entry:vi.fn(),entries:vi.fn(),update:vi.fn(),member:vi.fn(),upsert:vi.fn(),membership:vi.fn(),
  group:vi.fn(),groups:vi.fn(),ban:vi.fn(),audit:vi.fn(),applyUpdates:vi.fn(),moderate:vi.fn(),command:vi.fn(),processed:vi.fn(),
}))
vi.mock('../../src/config/env.js',()=>({env:{panelUsers:[{username:'owner',phone:'15550000000',role:'OWNER'}],WHATSAPP_NUMBER:'15550000001'}}))
vi.mock('../../src/auth/auth.service.js',()=>({findAdminByPhone:vi.fn()}))
vi.mock('../../src/scam-guard/scam-guard-config.model.js',()=>({ScamGuardConfig:{findByIdAndUpdate:m.config}}))
vi.mock('../../src/scam-guard/scam-entry.model.js',()=>({ScamEntry:{exists:m.exists,findOne:m.entry,find:m.entries,updateOne:m.update}}))
vi.mock('../../src/scam-guard/scam-report.model.js',()=>({ScamReport:{}}))
vi.mock('../../src/members/member.model.js',()=>({Member:{findOne:m.member}}))
vi.mock('../../src/members/member.service.js',()=>({upsertMember:m.upsert,setMembership:m.membership}))
vi.mock('../../src/groups/group.model.js',()=>({Group:{findOne:m.group,find:m.groups}}))
vi.mock('../../src/moderation/ban.model.js',()=>({Ban:{findOne:m.ban}}))
vi.mock('../../src/audit/audit.service.js',()=>({audit:m.audit}))
vi.mock('../../src/utils/logger.js',()=>({logger:{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:vi.fn()}}))
vi.mock('../../src/whatsapp/whatsapp.sync.js',()=>({applyGroupUpdates:m.applyUpdates}))
vi.mock('../../src/moderation/moderation.engine.js',()=>({moderateMessage:m.moderate}))
vi.mock('../../src/commands/command.router.js',()=>({handleCommand:m.command}))
vi.mock('../../src/idempotency/processed-message.model.js',()=>({ProcessedMessage:{updateOne:m.processed}}))
const phone='15551234567',pn=`${phone}@s.whatsapp.net`,lid='998877665544@lid'
let group:any,entry:any,sock:any,handlers:Record<string,(event:any)=>Promise<void>>
beforeEach(()=>{
  vi.resetModules();vi.resetAllMocks();vi.useFakeTimers()
  group={_id:'group1',groupJid:'group@g.us',name:'Test',botIsAdmin:true,welcome:{enabled:true,message:'Bienvenido {name}'}}
  entry={_id:'entry1',phoneNumberNormalized:phone,memberId:'member1',reason:'Reported',save:vi.fn().mockResolvedValue(undefined)}
  m.config.mockResolvedValue({enabled:true,sourceJids:[],publicAlertEnabled:true,scanExistingGroups:true,actionDelayMs:900})
  m.exists.mockResolvedValue({_id:'entry1'});m.entry.mockResolvedValue(entry);m.entries.mockReturnValue({lean:async()=>[entry]})
  m.member.mockReturnValue({lean:async()=>null});m.upsert.mockResolvedValue({_id:'member1'});m.group.mockResolvedValue(group)
  m.groups.mockReturnValue({sort:async()=>[group]});m.ban.mockResolvedValue(null);m.audit.mockResolvedValue(undefined)
  handlers={}
  sock={user:{id:'bot@s.whatsapp.net'},ev:{on:(name:string,fn:any)=>{handlers[name]=fn}},
    groupMetadata:vi.fn().mockResolvedValue({addressingMode:'lid',participants:[{id:lid,jid:pn,lid}]}),
    groupFetchAllParticipating:vi.fn(),groupParticipantsUpdate:vi.fn().mockResolvedValue([{jid:lid,status:'200'}]),sendMessage:vi.fn().mockResolvedValue({})}
})
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()})
async function join(userJid=lid){
  const {registerWhatsAppEvents}=await import('../../src/whatsapp/whatsapp.events.js')
  registerWhatsAppEvents(sock)
  const pending=handlers['group-participants.update']!({id:group.groupJid,participants:[userJid],action:'add'})
  await vi.advanceTimersByTimeAsync(10_000)
  await pending
}
describe('Scam Guard enforcement through WhatsApp events',()=>{
  it('removes an LID participant using their reported phone before any welcome',async()=>{
    await join()
    expect(sock.groupParticipantsUpdate).toHaveBeenCalledWith(group.groupJid,[lid],'remove')
    expect(m.membership).toHaveBeenCalledWith('member1','group1','BANNED')
    expect(sock.sendMessage).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage.mock.calls[0][1].text).toContain('detectado y expulsado')
    expect(sock.sendMessage.mock.calls.some((call:any)=>call[1].text.includes('Bienvenido'))).toBe(false)
  })
  it('uses a known PN/LID mapping when metadata omits the phone',async()=>{
    m.member.mockReturnValue({lean:async()=>({_id:'member1',phoneNumberNormalized:phone})})
    sock.groupMetadata.mockResolvedValue({addressingMode:'lid',participants:[{id:lid,lid}]})
    await join()
    expect(sock.groupParticipantsUpdate).toHaveBeenCalledWith(group.groupJid,[lid],'remove')
  })
  it('uses the PN address in a PN group',async()=>{
    sock.groupMetadata.mockResolvedValue({addressingMode:'pn',participants:[{id:pn}]})
    sock.groupParticipantsUpdate.mockResolvedValue([{jid:pn,status:'200'}])
    await join(pn)
    expect(sock.groupParticipantsUpdate).toHaveBeenCalledWith(group.groupJid,[pn],'remove')
  })
  it('preserves the welcome for a participant not on the blacklist',async()=>{
    m.entry.mockResolvedValue(null)
    await join(pn)
    expect(sock.groupParticipantsUpdate).not.toHaveBeenCalled()
    expect(sock.sendMessage).toHaveBeenCalledWith(group.groupJid,expect.objectContaining({text:expect.stringContaining('Bienvenido')}))
  })
  it.each([[],[{jid:lid,status:'403'}],[{jid:'someone-else@lid',status:'200'}]])('does not claim success or welcome a reported user without the matching 200 acknowledgement (%j)',async(result)=>{
    sock.groupParticipantsUpdate.mockResolvedValue(result)
    await join()
    expect(m.update).not.toHaveBeenCalled()
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })
  it('retries a rate-limited removal after cooldown and confirms it once',async()=>{
    sock.groupParticipantsUpdate.mockRejectedValueOnce({message:'rate-over-limit',data:429})
    await join()
    expect(sock.groupParticipantsUpdate).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(70_000)
    expect(sock.groupParticipantsUpdate).toHaveBeenCalledTimes(2)
    expect(m.update).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage).toHaveBeenCalledTimes(1)
  })
  it('coalesces overlapping attempts for the same blacklisted member',async()=>{
    const {registerWhatsAppEvents}=await import('../../src/whatsapp/whatsapp.events.js')
    registerWhatsAppEvents(sock)
    const event={id:group.groupJid,participants:[pn],action:'add'}
    const first=handlers['group-participants.update']!(event)
    const second=handlers['group-participants.update']!(event)
    await vi.advanceTimersByTimeAsync(10_000)
    await Promise.all([first,second])
    expect(sock.groupParticipantsUpdate).toHaveBeenCalledTimes(1)
    expect(m.update).toHaveBeenCalledTimes(1)
  })
  it('does not expand a 429 metadata failure into a full group fetch or a welcome',async()=>{
    sock.groupMetadata.mockRejectedValue({message:'rate-over-limit',data:429,output:{statusCode:500}})
    await join()
    expect(sock.groupMetadata).toHaveBeenCalledTimes(1)
    expect(sock.groupFetchAllParticipating).not.toHaveBeenCalled()
    expect(sock.groupParticipantsUpdate).not.toHaveBeenCalled()
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })
  it('suppresses welcome when the LID cannot be resolved, without guessing a phone',async()=>{
    sock.groupMetadata.mockResolvedValue({addressingMode:'lid',participants:[{id:lid}]})
    await join()
    expect(sock.groupParticipantsUpdate).not.toHaveBeenCalled()
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })
  it('does not remove a report revoked while the request was being prepared',async()=>{
    m.exists.mockResolvedValueOnce({_id:'entry1'}).mockResolvedValue(null)
    await join()
    expect(sock.groupParticipantsUpdate).not.toHaveBeenCalled()
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })
  it('checks all existing participants using the supplied snapshot and cached LID identity',async()=>{
    m.member.mockReturnValue({lean:async()=>({_id:'legacy-member',phoneNumberNormalized:phone})})
    const {queueScamGuardReconciliation}=await import('../../src/scam-guard/scam-guard.service.js')
    queueScamGuardReconciliation(sock,{[group.groupJid]:{addressingMode:'lid',participants:[{id:lid}]}})
    await vi.runAllTimersAsync()
    expect(sock.groupParticipantsUpdate).toHaveBeenCalledWith(group.groupJid,[lid],'remove')
    expect(sock.groupMetadata).not.toHaveBeenCalled()
    expect(sock.groupFetchAllParticipating).not.toHaveBeenCalled()
  })
  it('routes group updates to local persistence rather than another fetch',async()=>{
    const {registerWhatsAppEvents}=await import('../../src/whatsapp/whatsapp.events.js')
    registerWhatsAppEvents(sock)
    const update=[{id:group.groupJid,announce:true}]
    await handlers['groups.update']!(update)
    expect(m.applyUpdates).toHaveBeenCalledWith(update)
    expect(sock.groupFetchAllParticipating).not.toHaveBeenCalled()
  })
})
