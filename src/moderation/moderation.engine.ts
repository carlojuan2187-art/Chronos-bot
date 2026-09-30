import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { Group } from '../groups/group.model.js'
import { upsertMember } from '../members/member.service.js'
import { detectsBlockedLink } from './anti-link.service.js'
import { activeWarnings } from './warning.service.js'
import { warn, kick } from './moderation.service.js'
import { hasBypass } from './whitelist.service.js'
import { detectSpam } from './anti-spam.service.js'
import { matchBlockedTerm } from './blocked-content.service.js'
import { phoneFromJid } from '../utils/jid.js'
import { findAdminByPhone } from '../auth/auth.service.js'

function extractText(msg:WAMessage){const m:any=msg.message||{};return String(m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.videoMessage?.caption||'')}
export async function moderateMessage(sock:WASocket,msg:WAMessage){ const groupJid=msg.key.remoteJid;if(!groupJid?.endsWith('@g.us'))return;const participant=msg.key.participant;if(!participant)return;const group=await Group.findOne({groupJid});if(!group)return;const member=await upsertMember(participant,(msg as any).pushName);const text=extractText(msg);const phone=phoneFromJid(participant);if(findAdminByPhone(phone))return
  const deleteMsg=async()=>{try{await sock.sendMessage(groupJid,{delete:msg.key})}catch{}}
  if(detectsBlockedLink(text,(group as any).antiLink)&&!(await hasBypass(member._id,group,'antiLink'))){await deleteMsg();const active=await activeWarnings(member._id,group._id,'LINK');if(active.length>=1){await kick(group,member,'Segunda infracción anti-link','AUTOMATIC','CHRONOS');return}const days=Number((group as any).antiLink?.warningExpiresInDays||30);await warn(group,member,'LINK','Enlace/promoción no permitida','AUTOMATIC','CHRONOS',new Date(Date.now()+days*86400000));await sock.sendMessage(groupJid,{text:`⚠️ @${phone}, los enlaces o promociones no están permitidos. Esta es tu primera advertencia.`,mentions:[participant]});return}
  const m:any=msg.message||{};const media=Boolean(m.imageMessage||m.videoMessage||m.stickerMessage||m.documentMessage);const mentions=(m.extendedTextMessage?.contextInfo?.mentionedJid||[]).length;const spam=detectSpam(`${groupJid}:${participant}`,text,media,mentions,(group as any).antiSpam);if(spam&&!(await hasBypass(member._id,group,'antiSpam'))){await deleteMsg();const active=await activeWarnings(member._id,group._id,'SPAM');const hrs=Number((group as any).antiSpam?.warningExpiresHours||24);if(active.length>=2){await kick(group,member,'Spam/flood reiterado','AUTOMATIC','CHRONOS');return}await warn(group,member,'SPAM',`Anti-spam: ${spam}`,'AUTOMATIC','CHRONOS',new Date(Date.now()+hrs*3600000));await sock.sendMessage(groupJid,{text:`⚠️ @${phone}, evita el spam/flood. Advertencia ${active.length+1}/3.`,mentions:[participant]});return}
  const blocked=matchBlockedTerm(text,(group as any).blockedTerms);if(blocked&&!(await hasBypass(member._id,group,'blockedContent'))){if(['DELETE','WARN','KICK'].includes(blocked.action))await deleteMsg();if(blocked.action==='WARN')await warn(group,member,'BLOCKED_CONTENT','Contenido no permitido','AUTOMATIC','CHRONOS',new Date(Date.now()+30*86400000));if(blocked.action==='KICK')await kick(group,member,'Contenido no permitido','AUTOMATIC','CHRONOS')}
}
