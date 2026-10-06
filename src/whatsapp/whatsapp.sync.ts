import type { WASocket } from '@whiskeysockets/baileys'
import { getWhatsAppSocket } from './whatsapp.client.js'
import { upsertGroupFromWhatsApp } from '../groups/group.service.js'
import { Group } from '../groups/group.model.js'
import { SystemState } from '../system/system-state.model.js'
import { logger } from '../utils/logger.js'
import { upsertMemberFromParticipant,setMembership } from '../members/member.service.js'
import { queueScamGuardReconciliation } from '../scam-guard/scam-guard.service.js'
import { groupRequest } from './group-request.service.js'

const inFlight=new WeakMap<WASocket,Promise<{synced:number;members:number}>>()

// Baileys emits groups.update from groupFetchAllParticipating itself. Never
// fetch groups from this event: consume the supplied data instead.
export async function applyGroupUpdates(updates:any[]){
  for(const meta of updates){
    if(!meta.id)continue
    const set:Record<string,unknown>={updatedAt:new Date()}
    if(typeof meta.subject==='string')set.name=meta.subject
    if(typeof meta.desc==='string')set.description=meta.desc
    if(typeof meta.announce==='boolean')set['schedule.lastAppliedMode']=meta.announce?'CLOSED':'OPEN'
    if(Array.isArray(meta.participants))set.participantsCount=meta.participants.length
    await Group.updateOne({groupJid:meta.id},{$set:set})
  }
}

export function syncGroups():Promise<{synced:number;members:number}>{
  const sock=getWhatsAppSocket()
  if(!sock)return Promise.resolve({synced:0,members:0})
  const current=inFlight.get(sock)
  if(current)return current
  const pending=performSync(sock).finally(()=>inFlight.delete(sock))
  inFlight.set(sock,pending)
  return pending
}

async function performSync(sock:WASocket){
  const all=await groupRequest(sock,()=>sock.groupFetchAllParticipating())
  let n=0,members=0
  const botIdentity={id:sock.user?.id,lid:sock.user?.lid}
  for(const meta of Object.values(all)){
    const group=await upsertGroupFromWhatsApp(meta,botIdentity);n++
    if(typeof meta.announce==='boolean')await Group.updateOne({_id:group._id},{$set:{'schedule.lastAppliedMode':meta.announce?'CLOSED':'OPEN'}})
    for(const p of meta.participants||[]){
      const member=await upsertMemberFromParticipant(p);await setMembership(member._id,group._id,'ACTIVE');members++
    }
  }
  await SystemState.findByIdAndUpdate('singleton',{$set:{lastFullSyncAt:new Date(),updatedAt:new Date()}},{upsert:true})
  logger.info({groups:n,members},'Groups synchronized')
  queueScamGuardReconciliation(sock,all)
  return {synced:n,members}
}
