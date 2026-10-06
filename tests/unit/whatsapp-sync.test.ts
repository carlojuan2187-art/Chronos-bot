import { beforeEach,describe,expect,it,vi } from 'vitest'
const mock=vi.hoisted(()=>({socket:null as any,groupUpdate:vi.fn(),upsert:vi.fn(),member:vi.fn(),membership:vi.fn(),state:vi.fn(),reconcile:vi.fn()}))
vi.mock('../../src/whatsapp/whatsapp.client.js',()=>({getWhatsAppSocket:()=>mock.socket}))
vi.mock('../../src/groups/group.service.js',()=>({upsertGroupFromWhatsApp:mock.upsert}))
vi.mock('../../src/groups/group.model.js',()=>({Group:{updateOne:mock.groupUpdate}}))
vi.mock('../../src/members/member.service.js',()=>({upsertMemberFromParticipant:mock.member,setMembership:mock.membership}))
vi.mock('../../src/system/system-state.model.js',()=>({SystemState:{findByIdAndUpdate:mock.state}}))
vi.mock('../../src/scam-guard/scam-guard.service.js',()=>({queueScamGuardReconciliation:mock.reconcile}))
vi.mock('../../src/utils/logger.js',()=>({logger:{info:vi.fn()}}))
import { applyGroupUpdates,syncGroups } from '../../src/whatsapp/whatsapp.sync.js'

beforeEach(()=>{vi.clearAllMocks();mock.upsert.mockResolvedValue({_id:'g'});mock.member.mockResolvedValue({_id:'m'})})
describe('Group synchronization',()=>{
  it('does not recurse when Baileys emits groups.update during a full fetch',async()=>{
    const meta={id:'g@g.us',subject:'Test',announce:false,participants:[{id:'15551234567@s.whatsapp.net'}]}
    mock.socket={user:{id:'bot'},groupFetchAllParticipating:vi.fn(async()=>{await applyGroupUpdates([meta]);return {[meta.id]:meta}})}
    expect(await syncGroups()).toEqual({synced:1,members:1})
    expect(mock.socket.groupFetchAllParticipating).toHaveBeenCalledTimes(1)
    expect(mock.reconcile).toHaveBeenCalledWith(mock.socket,{[meta.id]:meta})
  })
  it('coalesces concurrent full synchronization calls',async()=>{
    let finish!:(value:any)=>void
    mock.socket={user:{},groupFetchAllParticipating:vi.fn(()=>new Promise(resolve=>{finish=resolve}))}
    const a=syncGroups(),b=syncGroups()
    expect(a).toBe(b)
    await Promise.resolve();finish({})
    await a
    expect(mock.socket.groupFetchAllParticipating).toHaveBeenCalledTimes(1)
  })
  it('applies a partial event without erasing unrelated group settings',async()=>{
    await applyGroupUpdates([{id:'g@g.us',announce:true}])
    expect(mock.groupUpdate).toHaveBeenCalledWith({groupJid:'g@g.us'},{$set:{updatedAt:expect.any(Date),'schedule.lastAppliedMode':'CLOSED'}})
  })
})
