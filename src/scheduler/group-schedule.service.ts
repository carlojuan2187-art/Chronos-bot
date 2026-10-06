import { DateTime } from 'luxon'
import { Group } from '../groups/group.model.js'
import { getWhatsAppSocket } from '../whatsapp/whatsapp.client.js'
import { logger } from '../utils/logger.js'
import { groupRequest,groupRequestBlocked,isGroupRateLimit } from '../whatsapp/group-request.service.js'
let timer:NodeJS.Timeout|null=null
let running:Promise<void>|null=null
function desiredMode(schedule:any){ if(schedule?.manualOverride==='OPEN')return 'OPEN';if(schedule?.manualOverride==='CLOSED')return 'CLOSED';if(schedule?.mode==='OPEN')return 'OPEN';if(schedule?.mode==='ADMINS_ONLY')return 'CLOSED';if(schedule?.mode!=='SCHEDULED')return 'OPEN';const now=DateTime.now().setZone(schedule.timezone||'UTC');if(Array.isArray(schedule.days)&&!schedule.days.includes(now.weekday))return 'CLOSED';const hm=now.toFormat('HH:mm');return hm>=String(schedule.openTime||'00:00')&&hm<String(schedule.closeTime||'23:59')?'OPEN':'CLOSED' }
async function applySchedules(){
  const sock=getWhatsAppSocket();if(!sock||groupRequestBlocked(sock))return
  const groups=await Group.find({status:{$in:['ACTIVE','NOT_ADMIN']}})
  for(const g of groups){
    const s:any=(g as any).schedule||{},want=desiredMode(s)
    if(s.lastAppliedMode===want||!g.botIsAdmin)continue
    try{
      // On a fresh deployment, observe the state before issuing a write.
      if(!s.lastAppliedMode){
        const meta=await groupRequest(sock,()=>sock.groupMetadata(g.groupJid))
        if(typeof meta.announce==='boolean'&&(meta.announce?'CLOSED':'OPEN')===want){
          await Group.updateOne({_id:g._id},{$set:{'schedule.lastAppliedMode':want,updatedAt:new Date()}})
          continue
        }
      }
      await groupRequest(sock,()=>sock.groupSettingUpdate(g.groupJid,want==='OPEN'?'not_announcement':'announcement'))
      await Group.updateOne({_id:g._id},{$set:{'schedule.lastAppliedMode':want,updatedAt:new Date()}})
      const msg=want==='OPEN'?s.openMessage:s.closeMessage
      if(msg)await sock.sendMessage(g.groupJid,{text:String(msg)})
    }catch(e){
      logger.warn({err:e,groupJid:g.groupJid},'Could not apply group schedule')
      if(isGroupRateLimit(e))break
    }
  }
}
export function tickGroupSchedules(){
  if(running)return running
  running=applySchedules().finally(()=>{running=null})
  return running
}
export function startGroupScheduleWorker(){
  if(timer)return
  const run=()=>void tickGroupSchedules().catch(e=>logger.error({err:e},'Group schedule tick failed'))
  timer=setInterval(run,30000);timer.unref();run()
}
export function stopGroupScheduleWorker(){if(timer){clearInterval(timer);timer=null}}
export async function forceGroupMode(groupId:string,mode:'OPEN'|'CLOSED'|null){
  const g=await Group.findById(groupId);if(!g)throw new Error('GROUP_NOT_FOUND')
  const schedule:any=(g as any).schedule||{}
  schedule.manualOverride=mode;schedule.lastAppliedMode=null;(g as any).schedule=schedule;g.markModified('schedule');await g.save()
  if(running)await running
  await tickGroupSchedules()
  return g
}
