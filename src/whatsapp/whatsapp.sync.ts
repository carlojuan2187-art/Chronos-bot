import { getWhatsAppSocket } from './whatsapp.client.js'
import { upsertGroupFromWhatsApp } from '../groups/group.service.js'
import { SystemState } from '../system/system-state.model.js'
import { logger } from '../utils/logger.js'
import { upsertMember,setMembership } from '../members/member.service.js'
export async function syncGroups(){
  const sock=getWhatsAppSocket(); if(!sock) return {synced:0,members:0}
  const all=await sock.groupFetchAllParticipating(); let n=0,members=0
  for(const meta of Object.values(all)){
    const group=await upsertGroupFromWhatsApp(meta,(sock as any).user?.id);n++
    for(const p of meta.participants||[]){
      const member=await upsertMember(p.id);await setMembership(member._id,group._id,'ACTIVE');members++
    }
  }
  await SystemState.findByIdAndUpdate('singleton',{$set:{lastFullSyncAt:new Date(),updatedAt:new Date()}},{upsert:true});logger.info({groups:n,members},'Groups synchronized'); return {synced:n,members}
}
