import { getWhatsAppSocket } from '../whatsapp/whatsapp.client.js'
import { Group } from '../groups/group.model.js'
import { Member } from '../members/member.model.js'
import { Ban } from './ban.model.js'
import { createWarning } from './warning.service.js'
import { ModerationEvent } from './moderation-event.model.js'
import { setMembership } from '../members/member.service.js'
import { GroupMembership } from '../members/membership.model.js'
import { AppError } from '../errors/app-error.js'
import { participantJids, phoneFromJid, sameUserJid, uniqueJids } from '../utils/jid.js'

export async function warn(group:any,member:any,type:string,reason:string,source:string,actor:string,expiresAt:Date){
  const w=await createWarning({memberId:member._id,groupId:group._id,communityId:group.communityId,type,reason,source,issuedBy:actor,expiresAt})
  await ModerationEvent.create({memberId:member._id,groupId:group._id,communityId:group.communityId,action:'WARNING_CREATED',reason,actor,source:source==='PANEL'?'PANEL':source==='AUTOMATIC'?'AUTOMATIC':'WHATSAPP_COMMAND',result:'SUCCESS'})
  return w
}

function matchesMember(participant:any,member:any){
  const participantIds=participantJids(participant)
  const memberIds=uniqueJids([member?.userJid,...(member?.alternateJids||[])])
  if(participantIds.some(candidate=>memberIds.some(saved=>candidate===saved||sameUserJid(candidate,saved)))) return true
  const phone=String(member?.phoneNumberNormalized||'')
  if(!phone)return false
  return participantIds.some(jid=>jid.endsWith('@s.whatsapp.net')&&phoneFromJid(jid)===phone)
}

async function liveGroupContext(group:any,member:any){
  const sock=getWhatsAppSocket()
  if(!sock)throw new AppError('WHATSAPP_DISCONNECTED','WhatsApp no está conectado',503)
  const meta=await sock.groupMetadata(group.groupJid)
  const botIdentity=uniqueJids([(sock as any).user?.id,(sock as any).user?.lid])
  const bot=meta.participants.find((p:any)=>participantJids(p).some(candidate=>botIdentity.some(id=>candidate===id||sameUserJid(candidate,id))))
  const botIsAdmin=Boolean(bot?.admin||bot?.isAdmin||bot?.isSuperAdmin)
  await Group.updateOne({_id:group._id},{$set:{botIsParticipant:Boolean(bot),botIsAdmin,status:botIsAdmin?'ACTIVE':(bot?'NOT_ADMIN':'REMOVED'),participantsCount:meta.participants.length,lastSyncAt:new Date(),updatedAt:new Date()}})
  if(!botIsAdmin)throw new AppError('BOT_NOT_ADMIN','CHRONOS necesita ser administrador del grupo',409)
  const participant=meta.participants.find((p:any)=>matchesMember(p,member))
  if(!participant)throw new AppError('MEMBER_NOT_FOUND','El usuario ya no está dentro de este grupo',404)
  const actionJid=participant.id||participant.jid||participant.lid
  if(!actionJid)throw new AppError('MEMBER_NOT_FOUND','No pude resolver la identidad actual del usuario en WhatsApp',404)
  return{sock,participant,actionJid}
}

async function removeFromGroup(group:any,member:any,status:'REMOVED'|'BANNED'){
  const {sock,actionJid}=await liveGroupContext(group,member)
  const result=await sock.groupParticipantsUpdate(group.groupJid,[actionJid],'remove')
  const rejected=(result||[]).find((row:any)=>row?.status&&String(row.status)!=='200')
  if(rejected)throw new AppError('WHATSAPP_ACTION_FAILED',`WhatsApp rechazó la expulsión (status ${String(rejected.status)})`,409,rejected)
  await setMembership(member._id,group._id,status)
  return{actionJid,result}
}

export async function kick(group:any,member:any,reason:string,source:string,actor:string){
  const removal=await removeFromGroup(group,member,'REMOVED')
  await ModerationEvent.create({memberId:member._id,groupId:group._id,communityId:group.communityId,action:'KICK',reason,actor,source:source==='PANEL'?'PANEL':source==='AUTOMATIC'?'AUTOMATIC':'WHATSAPP_COMMAND',result:'SUCCESS',metadata:{actionJid:removal.actionJid}})
  return removal
}

async function removeFromMatchingGroups(member:any,scope:'GROUP'|'COMMUNITY'|'GLOBAL',groupId?:any,communityId?:any){
  const memberships=await GroupMembership.find({memberId:member._id,status:'ACTIVE'}).lean()
  const ids=memberships.map(m=>m.groupId)
  const q:any={_id:{$in:ids}}
  if(scope==='GROUP')q._id=groupId
  if(scope==='COMMUNITY')q.communityId=communityId
  const groups=await Group.find(q)
  let removed=0,failed=0
  for(const g of groups){
    try{await removeFromGroup(g,member,'BANNED');removed++}catch{failed++}
  }
  return{removed,failed}
}

export async function ban(group:any,member:any,scope:'GROUP'|'COMMUNITY'|'GLOBAL',reason:string,actor:string){
  if(scope==='COMMUNITY'&&!group.communityId)throw new AppError('VALIDATION_ERROR','El grupo no tiene comunidad asignada',409)
  const existing=await Ban.findOne({memberId:member._id,scope,groupId:scope==='GROUP'?group._id:null,communityId:scope==='COMMUNITY'?group.communityId:null,status:'ACTIVE'})
  if(existing)throw new AppError('ALREADY_BANNED','El usuario ya tiene este ban activo',409)

  if(scope==='GROUP'){
    const removal=await removeFromGroup(group,member,'BANNED')
    const doc=await Ban.create({memberId:member._id,scope,groupId:group._id,communityId:null,reason,issuedBy:actor,status:'ACTIVE'})
    await ModerationEvent.create({memberId:member._id,groupId:group._id,communityId:group.communityId,action:'GROUP_BAN',reason,actor,source:'WHATSAPP_COMMAND',result:'SUCCESS',metadata:{actionJid:removal.actionJid}})
    return{doc,removed:1,failed:0}
  }

  const doc=await Ban.create({memberId:member._id,scope,groupId:null,communityId:scope==='COMMUNITY'?group.communityId:null,reason,issuedBy:actor,status:'ACTIVE'})
  const result=await removeFromMatchingGroups(member,scope,group._id,group.communityId)
  return{doc,...result}
}

export async function globalBan(member:any,reason:string,actor:string){
  const existing=await Ban.findOne({memberId:member._id,scope:'GLOBAL',status:'ACTIVE'})
  if(existing)throw new AppError('ALREADY_BANNED','El usuario ya tiene ban global',409)
  const doc=await Ban.create({memberId:member._id,scope:'GLOBAL',reason,issuedBy:actor,status:'ACTIVE'})
  const result=await removeFromMatchingGroups(member,'GLOBAL')
  return{doc,...result}
}
export async function revokeBan(banId:string){const b=await Ban.findById(banId);if(!b)throw new AppError('NOT_FOUND','Ban no encontrado',404);b.status='REVOKED';b.revokedAt=new Date();await b.save();return b}
export async function resolveGroupAndMember(groupId:string,memberId:string){const [group,member]=await Promise.all([Group.findById(groupId),Member.findById(memberId)]);if(!group)throw new AppError('GROUP_NOT_FOUND','Grupo no encontrado',404);if(!member)throw new AppError('MEMBER_NOT_FOUND','Miembro no encontrado',404);return{group,member}}
