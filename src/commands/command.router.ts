import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { phoneCandidatesFromMessageKey, participantMatchesJid } from '../utils/jid.js'
import { findAdminByPhone } from '../auth/auth.service.js'
import { Group } from '../groups/group.model.js'
import { hasPermission, type Permission } from '../config/permissions.js'
import { warn,kick,ban } from '../moderation/moderation.service.js'
import { activeWarnings } from '../moderation/warning.service.js'
import { upsertMemberFromParticipant } from '../members/member.service.js'
import { AppError } from '../errors/app-error.js'

const MANUAL_WARNING_LIMIT=3
const MANUAL_WARNING_EXPIRES_DAYS=30

function textOf(msg:WAMessage){const m:any=msg.message||{};return String(m.conversation||m.extendedTextMessage?.text||'').trim()}
function targetFromMessage(msg:WAMessage){
  const m:any=msg.message||{}
  const ctx=m.extendedTextMessage?.contextInfo||{}
  return ctx.participant||ctx.mentionedJid?.[0]||null
}

async function send(sock:WASocket,jid:string,text:string,mentions:string[]=[]){await sock.sendMessage(jid,{text,...(mentions.length?{mentions}: {})})}

async function requirePermission(sock:WASocket,jid:string,role:any,permission:Permission){
  if(hasPermission(role,permission))return true
  await send(sock,jid,'⛔ Tu rol no tiene permiso para ejecutar esta acción.')
  return false
}

async function resolveTarget(sock:WASocket,groupJid:string,msg:WAMessage){
  const raw=targetFromMessage(msg)
  if(!raw)return null
  const meta=await sock.groupMetadata(groupJid)
  const participant=meta.participants.find((p:any)=>participantMatchesJid(p,raw))
  if(!participant)return null
  const member=await upsertMemberFromParticipant(participant)
  const mentionJid=participant.id||participant.jid||participant.lid||raw
  return{member,mentionJid}
}

function errorMessage(error:unknown){
  if(error instanceof AppError)return `❌ ${error.message}`
  if(error instanceof Error)return `❌ No pude completar la acción: ${error.message}`
  return '❌ No pude completar la acción.'
}

export async function handleCommand(sock:WASocket,msg:WAMessage){
  const text=textOf(msg)
  if(!text.startsWith('/'))return false
  const jid=msg.key.remoteJid
  if(!jid)return true
  const [name='/',...args]=text.split(/\s+/)
  const cmd=name.toLowerCase()
  const actor=phoneCandidatesFromMessageKey(msg.key).map(findAdminByPhone).find(Boolean)||null

  if(cmd==='/reglas'||cmd==='/horario'||cmd==='/ayuda'){
    if(!jid.endsWith('@g.us')){await send(sock,jid,'Este comando debe usarse dentro de un grupo.');return true}
    const g=await Group.findOne({groupJid:jid})
    if(!g){await send(sock,jid,'Este grupo todavía no está sincronizado con CHRONOS.');return true}
    if(cmd==='/reglas'||cmd==='/ayuda')await send(sock,jid,`*${(g as any).rules?.title||'REGLAS'}*\n\n${(g as any).rules?.content||'Sin reglas configuradas.'}`)
    else await send(sock,jid,`Horario: ${(g as any).schedule?.mode||'OPEN'}\n${(g as any).schedule?.openTime||''} - ${(g as any).schedule?.closeTime||''} ${(g as any).schedule?.timezone||''}`)
    return true
  }

  if(!actor){await send(sock,jid,'⛔ No estás autorizado para usar comandos administrativos de CHRONOS.');return true}
  if(cmd==='/estado'||cmd==='/status'){await send(sock,jid,'✅ CHRONOS operativo.');return true}
  if(!['/warn','/kick','/ban','/warnings'].includes(cmd))return false
  if(!jid.endsWith('@g.us')){await send(sock,jid,'Por ahora las acciones de moderación deben ejecutarse dentro del grupo objetivo.');return true}

  const group=await Group.findOne({groupJid:jid})
  if(!group){await send(sock,jid,'❌ Grupo no sincronizado.');return true}

  let target
  try{target=await resolveTarget(sock,jid,msg)}catch(error){await send(sock,jid,errorMessage(error));return true}
  if(!target){await send(sock,jid,'Responde al mensaje de un usuario que todavía esté en el grupo o menciónalo para indicar el objetivo.');return true}

  const {member,mentionJid}=target
  const reason=args.join(' ')||'Moderación manual'
  const mentionLabel=`@${member.phoneNumberNormalized||mentionJid.split('@')[0]||'usuario'}`
  const protectedAdmin=member.phoneNumberNormalized?findAdminByPhone(String(member.phoneNumberNormalized)):null

  try{
    if(cmd==='/warn'){
      if(!(await requirePermission(sock,jid,actor.role,'members.warn')))return true
      const current=await activeWarnings(member._id,group._id,'MANUAL')
      if(current.length>=MANUAL_WARNING_LIMIT){
        await kick(group,member,'Límite de advertencias alcanzado','WHATSAPP_COMMAND',actor.username)
        await send(sock,jid,`🚫 ${mentionLabel} expulsado: ya había alcanzado ${MANUAL_WARNING_LIMIT}/${MANUAL_WARNING_LIMIT} advertencias.`,[mentionJid])
        return true
      }
      const expiresAt=new Date(Date.now()+MANUAL_WARNING_EXPIRES_DAYS*86400000)
      await warn(group,member,'MANUAL',reason,'WHATSAPP_COMMAND',actor.username,expiresAt)
      const count=current.length+1
      if(count>=MANUAL_WARNING_LIMIT){
        await send(sock,jid,`⚠️ ${mentionLabel}: advertencia ${count}/${MANUAL_WARNING_LIMIT}. Límite alcanzado; será expulsado.`,[mentionJid])
        await kick(group,member,'Límite de advertencias alcanzado','WHATSAPP_COMMAND',actor.username)
        await send(sock,jid,'🚫 Usuario expulsado por acumulación de advertencias.')
      }else{
        await send(sock,jid,`⚠️ ${mentionLabel}: advertencia ${count}/${MANUAL_WARNING_LIMIT}. Caduca en ${MANUAL_WARNING_EXPIRES_DAYS} días.`,[mentionJid])
      }
      return true
    }

    if(cmd==='/kick'){
      if(!(await requirePermission(sock,jid,actor.role,'members.kick')))return true
      if(protectedAdmin){await send(sock,jid,'⛔ No puedes expulsar mediante CHRONOS a otro administrador configurado del sistema.');return true}
      await kick(group,member,reason,'WHATSAPP_COMMAND',actor.username)
      await send(sock,jid,'✅ Usuario expulsado del grupo.')
      return true
    }

    if(cmd==='/ban'){
      if(!(await requirePermission(sock,jid,actor.role,'members.groupBan')))return true
      if(protectedAdmin){await send(sock,jid,'⛔ No puedes banear mediante CHRONOS a otro administrador configurado del sistema.');return true}
      await ban(group,member,'GROUP',reason,actor.username)
      await send(sock,jid,'🚫 Usuario expulsado y bloqueado para este grupo.')
      return true
    }

    if(cmd==='/warnings'){
      const rows=await activeWarnings(member._id,group._id,'MANUAL')
      await send(sock,jid,`${mentionLabel} tiene ${rows.length}/${MANUAL_WARNING_LIMIT} advertencias manuales activas.`,[mentionJid])
      return true
    }
  }catch(error){
    await send(sock,jid,errorMessage(error))
    return true
  }

  return false
}
