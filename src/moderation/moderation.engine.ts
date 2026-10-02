import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { Group } from '../groups/group.model.js'
import { upsertMember } from '../members/member.service.js'
import { detectsBlockedLink } from './anti-link.service.js'
import { activeWarnings } from './warning.service.js'
import { warn, kick } from './moderation.service.js'
import { hasBypass } from './whitelist.service.js'
import { detectSpam } from './anti-spam.service.js'
import { matchBlockedTerm } from './blocked-content.service.js'
import { phoneCandidatesFromMessageKey, phoneFromJid } from '../utils/jid.js'
import { findAdminByPhone } from '../auth/auth.service.js'
import { canWhatsAppAdminBypassAntiLink } from './whatsapp-admin.service.js'
import { accessBypass, botAccessForMember, messageIdentityCandidates } from './bot-access.service.js'
import { detectUnauthorizedBot } from './anti-bot.service.js'
import { audit } from '../audit/audit.service.js'
import { sendAntiBotRemovalFeedback, sendAntiLinkFirstWarning, sendAntiLinkRemovalFeedback } from './moderation-feedback.service.js'

function extractText(msg:WAMessage){const m:any=msg.message||{};return String(m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.videoMessage?.caption||'')}
export async function moderateMessage(sock:WASocket,msg:WAMessage){
  const groupJid=msg.key.remoteJid;if(!groupJid?.endsWith('@g.us'))return
  const participant=msg.key.participant;if(!participant)return
  const group=await Group.findOne({groupJid});if(!group)return
  const member=await upsertMember(participant,(msg as any).pushName,[String((msg.key as any).participantPn||''),(msg.key as any).participantLid].filter(Boolean))
  const text=extractText(msg)
  const admin=phoneCandidatesFromMessageKey(msg.key).map(findAdminByPhone).find(Boolean);if(admin)return
  const mention=participant
  const label=(msg as any).pushName||member.phoneNumberNormalized||phoneFromJid(participant)||'usuario'
  const deleteMsg=async()=>{try{await sock.sendMessage(groupJid,{delete:msg.key})}catch{}}

  // Bot access rules are evaluated before automatic filters. An ALLOW rule can
  // exempt a known publisher/support bot; a BLOCK rule is an explicit removal.
  const botAccess=await botAccessForMember(member,group,messageIdentityCandidates(msg),phoneCandidatesFromMessageKey(msg.key))
  if(botAccess?.access==='BLOCK'){
    await deleteMsg()
    try{
      await kick(group,member,`Bot bloqueado: ${botAccess.name||'regla Anti-Bot'}`,'AUTOMATIC','CHRONOS')
      await audit({actor:'CHRONOS',action:'BOT_BLOCK_RULE_ENFORCED',groupId:group._id,communityId:group.communityId,targetMemberId:member._id,source:'SYSTEM',result:'SUCCESS',reason:'Bot incluido en lista de bloqueo',metadata:{botAccessRuleId:botAccess._id,name:botAccess.name}})
      await sendAntiBotRemovalFeedback(sock,groupJid)
    }catch(error:any){
      await audit({actor:'CHRONOS',action:'BOT_BLOCK_RULE_ENFORCED',groupId:group._id,communityId:group.communityId,targetMemberId:member._id,source:'SYSTEM',result:'FAILED',reason:String(error?.message||error),metadata:{botAccessRuleId:botAccess._id,name:botAccess.name}})
      throw error
    }
    return
  }

  const antiBot=(group as any).antiBot
  if(antiBot?.enabled&&!accessBypass(botAccess,'antiBot')){
    const detection=detectUnauthorizedBot(`${String(group._id)}:${String(member._id)}`,text,antiBot)
    if(detection){
      if(antiBot?.deleteDetectedMessage!==false)await deleteMsg()
      try{
        await kick(group,member,detection.reason,'AUTOMATIC','CHRONOS')
        await audit({actor:'CHRONOS',action:'UNAUTHORIZED_BOT_REMOVED',groupId:group._id,communityId:group.communityId,targetMemberId:member._id,source:'SYSTEM',result:'SUCCESS',reason:detection.reason,metadata:{score:detection.score,signals:detection.signals}})
        await sendAntiBotRemovalFeedback(sock,groupJid)
      }catch(error:any){
        await audit({actor:'CHRONOS',action:'UNAUTHORIZED_BOT_REMOVAL_FAILED',groupId:group._id,communityId:group.communityId,targetMemberId:member._id,source:'SYSTEM',result:'FAILED',reason:String(error?.message||error),metadata:{score:detection.score,signals:detection.signals}})
        throw error
      }
      return
    }
  }

  const antiLink=(group as any).antiLink
  if(detectsBlockedLink(text,antiLink)&&!accessBypass(botAccess,'antiLink')&&!(await hasBypass(member._id,group,'antiLink'))&&!(await canWhatsAppAdminBypassAntiLink(sock,msg,antiLink))){
    await deleteMsg();const active=await activeWarnings(member._id,group._id,'LINK')
    if(active.length>=1){
      await kick(group,member,'Segunda infracción anti-link','AUTOMATIC','CHRONOS')
      await sendAntiLinkRemovalFeedback(sock,groupJid)
      return
    }
    const days=Number((group as any).antiLink?.warningExpiresInDays||30)
    await warn(group,member,'LINK','Enlace/promoción no permitida','AUTOMATIC','CHRONOS',new Date(Date.now()+days*86400000))
    await sendAntiLinkFirstWarning(sock,groupJid,label,mention)
    return
  }

  const m:any=msg.message||{};const media=Boolean(m.imageMessage||m.videoMessage||m.stickerMessage||m.documentMessage);const mentions=(m.extendedTextMessage?.contextInfo?.mentionedJid||[]).length
  const spam=detectSpam(`${groupJid}:${participant}`,text,media,mentions,(group as any).antiSpam)
  if(spam&&!accessBypass(botAccess,'antiSpam')&&!(await hasBypass(member._id,group,'antiSpam'))){
    await deleteMsg();const active=await activeWarnings(member._id,group._id,'SPAM');const hrs=Number((group as any).antiSpam?.warningExpiresHours||24)
    if(active.length>=2){await kick(group,member,'Spam/flood reiterado','AUTOMATIC','CHRONOS');return}
    await warn(group,member,'SPAM',`Anti-spam: ${spam}`,'AUTOMATIC','CHRONOS',new Date(Date.now()+hrs*3600000))
    await sock.sendMessage(groupJid,{text:`⚠️ ${label}, evita el spam/flood. Advertencia ${active.length+1}/3.`,mentions:[mention]});return
  }

  const blocked=matchBlockedTerm(text,(group as any).blockedTerms)
  if(blocked&&!accessBypass(botAccess,'blockedContent')&&!(await hasBypass(member._id,group,'blockedContent'))){
    if(['DELETE','WARN','KICK'].includes(blocked.action))await deleteMsg()
    if(blocked.action==='WARN')await warn(group,member,'BLOCKED_CONTENT','Contenido no permitido','AUTOMATIC','CHRONOS',new Date(Date.now()+30*86400000))
    if(blocked.action==='KICK')await kick(group,member,'Contenido no permitido','AUTOMATIC','CHRONOS')
  }
}
