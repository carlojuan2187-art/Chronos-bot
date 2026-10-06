import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '../utils/logger.js'
import { ProcessedMessage } from '../idempotency/processed-message.model.js'
import { handleCommand } from '../commands/command.router.js'
import { moderateMessage } from '../moderation/moderation.engine.js'
import { Group } from '../groups/group.model.js'
import { upsertMember,setMembership } from '../members/member.service.js'
import { Ban } from '../moderation/ban.model.js'
import { applyGroupUpdates } from './whatsapp.sync.js'
import { handleScamGuardMessage,handleScamGuardParticipantAdd } from '../scam-guard/scam-guard.service.js'

export function registerWhatsAppEvents(sock:WASocket){
  sock.ev.on('messages.upsert',async({messages})=>{for(const msg of messages){try{
    if(!msg.message||!msg.key.id)continue
    const inserted=await ProcessedMessage.updateOne({messageId:msg.key.id},{$setOnInsert:{messageId:msg.key.id,groupJid:msg.key.remoteJid,processedAt:new Date()}},{upsert:true})
    if(inserted.upsertedCount===0)continue
    // Scam Guard is evaluated before the generic fromMe filter because a
    // trusted reporting source may be operated from the same WhatsApp account
    // that is linked to CHRONOS. Other moderation/commands still ignore
    // messages sent by the bot account itself.
    if(await handleScamGuardMessage(sock,msg))continue
    if(msg.key.fromMe)continue
    if(await handleCommand(sock,msg))continue
    await moderateMessage(sock,msg)
  }catch(e){logger.error({err:e},'Message processing failed')}}})

  sock.ev.on('group-participants.update',async(update)=>{try{
    const group=await Group.findOne({groupJid:update.id});if(!group)return
    for(const userJid of update.participants){
      if(update.action==='add'&&await handleScamGuardParticipantAdd(sock,group,userJid))continue
      const member=await upsertMember(userJid)
      if(update.action==='add'){
        await setMembership(member._id,group._id,'ACTIVE')
        const banned=await Ban.findOne({memberId:member._id,status:'ACTIVE',$or:[{scope:'GLOBAL'},{scope:'GROUP',groupId:group._id},...(group.communityId?[{scope:'COMMUNITY',communityId:group.communityId}]:[])]})
        if(banned&&group.botIsAdmin){await sock.groupParticipantsUpdate(group.groupJid,[userJid],'remove');continue}
        const w:any=(group as any).welcome
        if(w?.enabled){
          const name=`@${userJid.split('@')[0]}`
          const text=String(w.message||'Bienvenido {name}').replaceAll('{name}',name).replaceAll('{group}',group.name).replaceAll('{community}','').replaceAll('{date}',new Date().toLocaleDateString()).replaceAll('{rules}',(group as any).rules?.content||'')
          const sent=await sock.sendMessage(group.groupJid,{text,mentions:w.mentionUser?[userJid]:[]})
          if(w.autoDelete&&sent?.key){const delay=Math.max(1,Number(w.deleteAfterMinutes||10))*60000;setTimeout(()=>sock.sendMessage(group.groupJid,{delete:sent.key}).catch(()=>{}),delay).unref()}
        }
      }else if(update.action==='remove'){
        const activeBan=await Ban.findOne({memberId:member._id,status:'ACTIVE',$or:[{scope:'GLOBAL'},{scope:'GROUP',groupId:group._id},...(group.communityId?[{scope:'COMMUNITY',communityId:group.communityId}]:[])]})
        await setMembership(member._id,group._id,activeBan?'BANNED':'LEFT')
      }
    }
  }catch(e){logger.error({err:e},'Participant update failed')}})

  sock.ev.on('groups.update',async(updates)=>{try{await applyGroupUpdates(updates)}catch(e){logger.warn({err:e},'Group incremental sync failed')}})
}
