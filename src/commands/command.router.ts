import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { phoneCandidatesFromMessageKey } from '../utils/jid.js'
import { findAdminByPhone } from '../auth/auth.service.js'
import { Group } from '../groups/group.model.js'
import { Member } from '../members/member.model.js'
import { hasPermission } from '../config/permissions.js'
import { warn,kick,ban } from '../moderation/moderation.service.js'
import { activeWarnings } from '../moderation/warning.service.js'

function textOf(msg:WAMessage){const m:any=msg.message||{};return String(m.conversation||m.extendedTextMessage?.text||'').trim()}
function quotedParticipant(msg:WAMessage){const m:any=msg.message||{};return m.extendedTextMessage?.contextInfo?.participant||m.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||null}
export async function handleCommand(sock:WASocket,msg:WAMessage){ const text=textOf(msg);if(!text.startsWith('/'))return false;const jid=msg.key.remoteJid;if(!jid)return true;const [name='/',...args]=text.split(/\s+/);const cmd=name.toLowerCase();const participant=msg.key.participant||jid;const actor=phoneCandidatesFromMessageKey(msg.key).map(findAdminByPhone).find(Boolean)||null
  if(cmd==='/reglas'||cmd==='/horario'||cmd==='/ayuda'){if(!jid.endsWith('@g.us')){await sock.sendMessage(jid,{text:'Este comando debe usarse dentro de un grupo.'});return true}const g=await Group.findOne({groupJid:jid});if(!g){await sock.sendMessage(jid,{text:'Este grupo todavía no está sincronizado con CHRONOS.'});return true}if(cmd==='/reglas'||cmd==='/ayuda')await sock.sendMessage(jid,{text:`*${(g as any).rules?.title||'REGLAS'}*\n\n${(g as any).rules?.content||'Sin reglas configuradas.'}`});else await sock.sendMessage(jid,{text:`Horario: ${(g as any).schedule?.mode||'OPEN'}\n${(g as any).schedule?.openTime||''} - ${(g as any).schedule?.closeTime||''} ${(g as any).schedule?.timezone||''}`});return true}
  if(!actor){await sock.sendMessage(jid,{text:'⛔ No estás autorizado para usar comandos administrativos de CHRONOS.'});return true}
  if(cmd==='/estado'||cmd==='/status'){await sock.sendMessage(jid,{text:'✅ CHRONOS operativo.'});return true}
  if(!jid.endsWith('@g.us')){await sock.sendMessage(jid,{text:'Por ahora las acciones de moderación deben ejecutarse dentro del grupo objetivo.'});return true}
  const group=await Group.findOne({groupJid:jid});if(!group){await sock.sendMessage(jid,{text:'Grupo no sincronizado.'});return true}const targetJid=quotedParticipant(msg);if(!targetJid){await sock.sendMessage(jid,{text:'Responde al mensaje del usuario o menciónalo para indicar el objetivo.'});return true}const member=await Member.findOne({userJid:targetJid});if(!member){await sock.sendMessage(jid,{text:'No tengo registrado a ese miembro todavía.'});return true}const reason=args.join(' ')||'Moderación manual'
  if(cmd==='/warn'){if(!hasPermission(actor.role,'members.warn'))return true;await warn(group,member,'MANUAL',reason,'WHATSAPP_COMMAND',actor.username,new Date(Date.now()+30*86400000));await sock.sendMessage(jid,{text:'⚠️ Advertencia registrada.'});return true}
  if(cmd==='/kick'){if(!hasPermission(actor.role,'members.kick'))return true;await kick(group,member,reason,'WHATSAPP_COMMAND',actor.username);return true}
  if(cmd==='/ban'){if(!hasPermission(actor.role,'members.groupBan'))return true;await ban(group,member,'GROUP',reason,actor.username);return true}
  if(cmd==='/warnings'){const rows=await activeWarnings(member._id,group._id,'MANUAL');await sock.sendMessage(jid,{text:`Advertencias manuales activas: ${rows.length}`});return true}
  return false }
