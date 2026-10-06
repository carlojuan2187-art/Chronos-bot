import type { WASocket,WAMessage } from '@whiskeysockets/baileys'
import { ScamGuardConfig } from './scam-guard-config.model.js'
import { ScamEntry } from './scam-entry.model.js'
import { ScamReport } from './scam-report.model.js'
import { parseScamReport,maskPhone } from './scam-guard.parser.js'
import { env,type PanelUser } from '../config/env.js'

type ScamGuardActor=Pick<PanelUser,'username'|'phone'|'role'>
import { findAdminByPhone } from '../auth/auth.service.js'
import { phoneCandidatesFromMessageKey,normalizePhone,participantJids,phoneFromJid,isPhoneJid,isLidJid,sameUserJid,uniqueJids } from '../utils/jid.js'
import { upsertMember,setMembership } from '../members/member.service.js'
import { Member } from '../members/member.model.js'
import { Ban } from '../moderation/ban.model.js'
import { Group } from '../groups/group.model.js'
import { audit } from '../audit/audit.service.js'
import { logger } from '../utils/logger.js'
import { AppError } from '../errors/app-error.js'
import { GroupMembership } from '../members/membership.model.js'

const DEFAULT_CONFIG={enabled:true,sourceJids:[] as string[],publicAlertEnabled:true,scanExistingGroups:true,actionDelayMs:900}
let sweepChain:Promise<void>=Promise.resolve()
let reconciliationQueued=false
let hotConfig:any=null
let hotConfigAt=0
const HOT_CONFIG_TTL_MS=30_000

function unwrapMessageContent(message:any):any{
  let current=message||{}
  for(let i=0;i<6;i++){
    const nested=current?.ephemeralMessage?.message||current?.viewOnceMessage?.message||current?.viewOnceMessageV2?.message||current?.viewOnceMessageV2Extension?.message||current?.documentWithCaptionMessage?.message||current?.editedMessage?.message
    if(!nested)break
    current=nested
  }
  return current
}

export function scamGuardMessageText(msg:WAMessage){
  const m:any=unwrapMessageContent(msg.message||{})
  return String(
    m.conversation||
    m.extendedTextMessage?.text||
    m.imageMessage?.caption||
    m.videoMessage?.caption||
    m.documentMessage?.caption||
    m.buttonsMessage?.contentText||
    m.templateButtonReplyMessage?.selectedDisplayText||
    ''
  ).trim()
}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}

function senderJidsFromMessage(msg:WAMessage){
  const key:any=msg.key||{}
  return uniqueJids([key.participantPn,key.senderPn,key.participant,key.participantLid,key.senderLid])
}

function actorFromKnownPhones(phones:string[]){
  for(const phone of phones){
    const actor=findAdminByPhone(normalizePhone(phone))
    if(actor)return actor
  }
  return null
}

async function resolveScamGuardActor(sock:WASocket,msg:WAMessage,jid:string){
  const direct=actorFromKnownPhones(phoneCandidatesFromMessageKey(msg.key))
  if(direct)return direct

  const senderJids=senderJidsFromMessage(msg)
  if(senderJids.length){
    try{
      const member:any=await Member.findOne({$or:[{userJid:{$in:senderJids}},{alternateJids:{$in:senderJids}}]}).lean()
      if(member?.phoneNumberNormalized){
        const actor=findAdminByPhone(normalizePhone(String(member.phoneNumberNormalized)))
        if(actor)return actor
      }
    }catch(error){
      logger.debug({err:error,jid},'Scam Guard could not resolve reporter through member cache')
    }
  }

  if(jid.endsWith('@g.us')&&senderJids.length){
    try{
      const meta:any=await sock.groupMetadata(jid)
      const participant=meta?.participants?.find((row:any)=>participantJids(row).some(candidate=>senderJids.some(sender=>candidate===sender||sameUserJid(candidate,sender))))
      if(participant){
        const phoneJids=participantJids(participant).filter(isPhoneJid)
        const actor=actorFromKnownPhones(phoneJids.map(phoneFromJid))
        if(actor){
          try{await upsertMember(participant.jid||participant.id||participant.lid,undefined,participantJids(participant))}catch{}
          return actor
        }
      }
    }catch(error){
      logger.warn({err:error,jid,senderJids},'Scam Guard could not resolve reporter through group metadata')
    }
  }

  return null
}
function canReport(actor:ScamGuardActor|null):actor is ScamGuardActor{return Boolean(actor&&(actor.role==='OWNER'||actor.role==='ADMIN'))}
function protectedPhone(phone:string){return env.panelUsers.some(user=>user.phone===phone)||phone===normalizePhone(env.WHATSAPP_NUMBER)}

export async function getScamGuardConfig(){
  const doc=await ScamGuardConfig.findByIdAndUpdate('singleton',{$setOnInsert:{_id:'singleton',...DEFAULT_CONFIG,updatedAt:new Date()}},{upsert:true,new:true,setDefaultsOnInsert:true})
  if(!doc)throw new Error('SCAM_GUARD_CONFIG_UNAVAILABLE')
  return doc
}

function snapshotConfig(doc:any){return{enabled:doc.enabled!==false,sourceJids:[...(doc.sourceJids||[])],publicAlertEnabled:doc.publicAlertEnabled!==false,scanExistingGroups:doc.scanExistingGroups!==false,actionDelayMs:Number(doc.actionDelayMs||900)}}
async function getHotScamGuardConfig(){
  if(hotConfig&&Date.now()-hotConfigAt<HOT_CONFIG_TTL_MS)return hotConfig
  const doc=await getScamGuardConfig();hotConfig=snapshotConfig(doc);hotConfigAt=Date.now();return hotConfig
}

export async function updateScamGuardConfig(input:any,actor:string){
  await getScamGuardConfig()
  const set:any={updatedBy:actor,updatedAt:new Date()}
  if(input.enabled!==undefined)set.enabled=Boolean(input.enabled)
  if(input.publicAlertEnabled!==undefined)set.publicAlertEnabled=Boolean(input.publicAlertEnabled)
  if(input.scanExistingGroups!==undefined)set.scanExistingGroups=Boolean(input.scanExistingGroups)
  if(input.actionDelayMs!==undefined)set.actionDelayMs=Math.max(250,Math.min(10000,Number(input.actionDelayMs)||900))
  if(input.sourceJids!==undefined)set.sourceJids=[...new Set((input.sourceJids as string[]).map(v=>String(v).trim()).filter(Boolean))]
  await ScamGuardConfig.updateOne({_id:'singleton'},{$set:set})
  const doc=await getScamGuardConfig();hotConfig=snapshotConfig(doc);hotConfigAt=Date.now();return doc
}

export async function trustScamSourceJid(jid:string,actor:string){
  const cfg=await getScamGuardConfig()
  const sourceJids=[...new Set([...(cfg.sourceJids||[]),jid])]
  return updateScamGuardConfig({sourceJids},actor)
}

async function ensureGlobalBan(phone:string,member:any,reason:string,actor:string){
  let ban=await Ban.findOne({memberId:member._id,scope:'GLOBAL',status:'ACTIVE'})
  if(ban)return{ban,ownsBan:false}
  ban=await Ban.create({memberId:member._id,scope:'GLOBAL',groupId:null,communityId:null,reason:`SCAM_GUARD: ${reason}`,issuedBy:actor,status:'ACTIVE'})
  return{ban,ownsBan:true}
}

export async function registerScamReport(input:{phone:string;reason?:string;actor:ScamGuardActor;source:'WHATSAPP'|'PANEL';sourceJid?:string;sourceMessageId?:string;sock?:WASocket|null}){
  const phone=normalizePhone(input.phone)
  if(phone.length<8||phone.length>15)throw new AppError('VALIDATION_ERROR','Número reportado inválido',400)
  if(protectedPhone(phone))throw new AppError('PROTECTED_ADMIN','No se puede añadir a Scam Guard el número del bot ni un administrador configurado de CHRONOS',409)
  if(!canReport(input.actor))throw new AppError('FORBIDDEN','Solo OWNER/ADMIN pueden registrar reportes confirmados',403)
  const reason=String(input.reason||'Reporte confirmado por administrador de CHRONOS').trim().slice(0,500)||'Reporte confirmado por administrador de CHRONOS'
  const now=new Date()
  let entry=await ScamEntry.findOne({phoneNumberNormalized:phone})
  if(!entry){
    entry=await ScamEntry.create({phoneNumberNormalized:phone,status:'ACTIVE',reason,firstReportedAt:now,lastReportedAt:now,firstReportedBy:input.actor.username,lastReportedBy:input.actor.username,sourceJid:input.sourceJid||'',reportCount:1,createdAt:now,updatedAt:now})
  }else{
    entry.status='ACTIVE';entry.reason=reason;entry.lastReportedAt=now;entry.lastReportedBy=input.actor.username;entry.sourceJid=input.sourceJid||entry.sourceJid;entry.reportCount=Math.max(1,Number(entry.reportCount||0)+1);entry.revokedAt=undefined;entry.revokedBy=undefined;entry.updatedAt=now;await entry.save()
  }
  try{
    await ScamReport.create({entryId:entry._id,phoneNumberNormalized:phone,reason,reportedBy:input.actor.username,reporterRole:input.actor.role,source:input.source,sourceJid:input.sourceJid||'',sourceMessageId:input.sourceMessageId||undefined,createdAt:now})
  }catch(error:any){
    if(error?.code!==11000)throw error
  }
  const member=await upsertMember(`${phone}@s.whatsapp.net`)
  const banResult=await ensureGlobalBan(phone,member,reason,input.actor.username)
  const preservesOwnedBan=Boolean(entry.ownsBan&&entry.banId&&String(entry.banId)===String(banResult.ban._id));entry.memberId=member._id;entry.banId=banResult.ban._id;entry.ownsBan=preservesOwnedBan||banResult.ownsBan;entry.updatedAt=new Date();await entry.save()
  await audit({actor:input.actor.username,actorRole:input.actor.role,action:'SCAM_GUARD_REPORT_ACCEPTED',targetMemberId:member._id,source:input.source==='PANEL'?'PANEL':'WHATSAPP',result:'SUCCESS',reason,metadata:{phoneNumberNormalized:phone,sourceJid:input.sourceJid||null,entryId:entry._id}})
  const cfg=await getHotScamGuardConfig()
  if(cfg.scanExistingGroups!==false&&input.sock)queueScamSweep(String(entry._id),input.sock)
  return entry
}

function participantPhone(participant:any){
  for(const jid of participantJids(participant)){if(isPhoneJid(jid)){const phone=phoneFromJid(jid);if(phone)return phone}}
  return ''
}
function botIsAdmin(meta:any,sock:WASocket){
  const ids=uniqueJids([(sock as any).user?.id,(sock as any).user?.lid])
  const bot=meta.participants?.find((p:any)=>participantJids(p).some(candidate=>ids.some(id=>candidate===id||sameUserJid(candidate,id))))
  return Boolean(bot?.admin||bot?.isAdmin||bot?.isSuperAdmin)
}
async function publicScamAlert(sock:WASocket,group:any,entry:any){
  const cfg=await getHotScamGuardConfig();if(cfg.publicAlertEnabled===false)return
  const phone=maskPhone(String(entry.phoneNumberNormalized))
  const text=`🛡️ *CHRONOS — SCAM GUARD*\n\nUn usuario previamente reportado por estafa ha sido detectado y expulsado de este grupo.\n\n🚫 Ban global permanente activo\n📱 Identidad: ${phone}\n🔐 Protección automática CHRONOS`
  try{await sock.sendMessage(group.groupJid,{text})}catch(error){logger.warn({err:error,groupJid:group.groupJid},'Scam Guard public alert failed')}
}

async function removeEntryFromGroup(sock:WASocket,entry:any,group:any,participantHint?:string,allowEventHint=false){
  const meta=await sock.groupMetadata(group.groupJid)
  if(!botIsAdmin(meta,sock)){
    logger.warn({groupJid:group.groupJid,phone:entry.phoneNumberNormalized},'Scam Guard cannot remove reported user because CHRONOS is not a WhatsApp admin in this group')
    return false
  }
  const phone=String(entry.phoneNumberNormalized)
  const participant=meta.participants?.find((p:any)=>participantPhone(p)===phone||(participantHint&&participantJids(p).some(id=>id===participantHint||sameUserJid(id,participantHint))))
  let actionJid:string|undefined
  if(participant){
    const actualPhone=participantPhone(participant)
    if(actualPhone&&actualPhone!==phone)return false
    actionJid=participant.id||participant.jid||participant.lid||participantHint
  }else if(allowEventHint&&participantHint){
    // On a fresh participant-add event WhatsApp may emit the join before a
    // subsequent groupMetadata() query contains the new member. The event JID
    // is authoritative for the just-added participant, so it is safe to use it
    // after the blacklist identity has already been resolved.
    const hintPhone=isPhoneJid(participantHint)?phoneFromJid(participantHint):''
    if(hintPhone&&hintPhone!==phone)return false
    actionJid=participantHint
  }else return false
  if(!actionJid)return false
  const result=await sock.groupParticipantsUpdate(group.groupJid,[actionJid],'remove')
  const rejected=(result||[]).find((row:any)=>row?.status&&String(row.status)!=='200')
  if(rejected)throw new Error(`WhatsApp rechazó la expulsión Scam Guard (status ${String(rejected.status)})`)
  if(entry.memberId)await setMembership(entry.memberId,group._id,'BANNED')
  await ScamEntry.updateOne({_id:entry._id},{$inc:{detectionCount:1,removalCount:1},$set:{lastDetectedAt:new Date(),lastRemovedAt:new Date(),updatedAt:new Date()}})
  await audit({actor:'CHRONOS',action:'SCAM_GUARD_PERMANENT_BAN_ENFORCED',groupId:group._id,communityId:group.communityId,targetMemberId:entry.memberId,source:'SYSTEM',result:'SUCCESS',reason:entry.reason,metadata:{entryId:entry._id,phoneNumberNormalized:phone,actionJid}})
  await publicScamAlert(sock,group,entry)
  return true
}

async function sweepEntry(entryId:string,sock:WASocket){
  const entry=await ScamEntry.findOne({_id:entryId,status:'ACTIVE'});if(!entry)return
  const cfg=await getHotScamGuardConfig();if(!cfg.enabled)return
  const groups=await Group.find({botIsAdmin:true,status:'ACTIVE'}).sort({name:1})
  for(const group of groups){
    try{await removeEntryFromGroup(sock,entry,group)}catch(error:any){
      await audit({actor:'CHRONOS',action:'SCAM_GUARD_SWEEP_FAILED',groupId:group._id,communityId:group.communityId,targetMemberId:entry.memberId,source:'SYSTEM',result:'FAILED',reason:String(error?.message||error),metadata:{entryId:entry._id,phoneNumberNormalized:entry.phoneNumberNormalized}})
      logger.warn({err:error,groupJid:group.groupJid,phone:entry.phoneNumberNormalized},'Scam Guard sweep failed for group')
      if(String(error?.message||error).includes('429'))await sleep(5000)
    }
    await sleep(Number(cfg.actionDelayMs||900))
  }
}

export function queueScamSweep(entryId:string,sock:WASocket){
  sweepChain=sweepChain.then(()=>sweepEntry(entryId,sock)).catch(error=>logger.error({err:error,entryId},'Scam Guard sweep failed'))
}

async function reconcileKnownMemberships(sock:WASocket){
  const cfg=await getHotScamGuardConfig();if(!cfg.enabled)return
  const entries=await ScamEntry.find({status:'ACTIVE',memberId:{$ne:null}})
  for(const entry of entries){
    const memberships=await GroupMembership.find({memberId:entry.memberId,status:'ACTIVE'}).lean()
    if(!memberships.length)continue
    const groups=await Group.find({_id:{$in:memberships.map(row=>row.groupId)},botIsAdmin:true,status:'ACTIVE'}).sort({name:1})
    for(const group of groups){
      try{await removeEntryFromGroup(sock,entry,group)}catch(error:any){
        logger.warn({err:error,groupJid:group.groupJid,phone:entry.phoneNumberNormalized},'Scam Guard reconciliation failed for group')
      }
      await sleep(Number(cfg.actionDelayMs||900))
    }
  }
}

export function queueScamGuardReconciliation(sock:WASocket){
  if(reconciliationQueued)return
  reconciliationQueued=true
  sweepChain=sweepChain.then(()=>reconcileKnownMemberships(sock)).catch(error=>logger.error({err:error},'Scam Guard reconciliation failed')).finally(()=>{reconciliationQueued=false})
}

export async function handleScamGuardParticipantAdd(sock:WASocket,group:any,userJid:string){
  const cfg=await getHotScamGuardConfig();if(!cfg.enabled)return false
  if(!(await ScamEntry.exists({status:'ACTIVE'})))return false
  try{
    let phone=isPhoneJid(userJid)?phoneFromJid(userJid):''
    let participant:any=null

    // Prefer the identity carried by the participant-add event itself. This
    // avoids a race where groupMetadata() still reflects the group just before
    // the new member was inserted.
    let entry=phone?await ScamEntry.findOne({phoneNumberNormalized:phone,status:'ACTIVE'}):null

    // If WhatsApp emitted only a LID, first try the PN/LID relation already
    // learned by normal group synchronization.
    if(!entry&&isLidJid(userJid)){
      const cached:any=await Member.findOne({$or:[{userJid},{alternateJids:userJid}]}).lean()
      const cachedPhone=normalizePhone(String(cached?.phoneNumberNormalized||''))
      if(cachedPhone){
        const cachedEntry=await ScamEntry.findOne({phoneNumberNormalized:cachedPhone,status:'ACTIVE'})
        if(cachedEntry){phone=cachedPhone;entry=cachedEntry}
      }
    }

    // WhatsApp can emit GROUP_PARTICIPANT_ADD a fraction of a second before a
    // metadata query exposes the new participant. Retry briefly only when the
    // event identity was not enough to resolve the blacklist entry.
    if(!entry){
      const delays=[0,350,900,1800]
      for(const delay of delays){
        if(delay)await sleep(delay)
        const meta=await sock.groupMetadata(group.groupJid)
        participant=meta.participants?.find((p:any)=>participantJids(p).some(id=>id===userJid||sameUserJid(id,userJid)))||null
        if(!participant)continue
        phone=participantPhone(participant)||(isPhoneJid(userJid)?phoneFromJid(userJid):'')
        if(!phone)continue
        entry=await ScamEntry.findOne({phoneNumberNormalized:phone,status:'ACTIVE'})
        if(entry)break
      }
    }

    if(!entry||!phone)return false

    const aliases=participant?participantJids(participant):uniqueJids([userJid,`${phone}@s.whatsapp.net`])
    const canonical=participant?.jid||participant?.id||`${phone}@s.whatsapp.net`
    const member=await upsertMember(canonical,undefined,aliases)
    entry.memberId=member._id;await entry.save()
    await setMembership(member._id,group._id,'ACTIVE')

    logger.info({groupJid:group.groupJid,userJid,phone,entryId:entry._id},'Scam Guard detected a blacklisted participant joining a protected group')
    const removed=await removeEntryFromGroup(sock,entry,group,userJid,true)
    if(!removed){
      await audit({actor:'CHRONOS',action:'SCAM_GUARD_JOIN_DETECTED_NOT_REMOVED',groupId:group._id,communityId:group.communityId,targetMemberId:member._id,source:'SYSTEM',result:'FAILED',reason:'Reported user detected on join but removal could not be executed. Verify that CHRONOS is a WhatsApp administrator in the group.',metadata:{userJid,phone,entryId:entry._id}})
    }
    return removed
  }catch(error:any){
    logger.error({err:error,groupJid:group.groupJid,userJid},'Scam Guard join enforcement failed')
    await audit({actor:'CHRONOS',action:'SCAM_GUARD_JOIN_ENFORCEMENT_FAILED',groupId:group._id,communityId:group.communityId,source:'SYSTEM',result:'FAILED',reason:String(error?.message||error),metadata:{userJid}})
    return false
  }
}

export async function handleScamGuardMessage(sock:WASocket,msg:WAMessage){
  const jid=msg.key.remoteJid;if(!jid)return false
  const text=scamGuardMessageText(msg);if(!text)return false
  if(/^\/scam-source\b/i.test(text)){
    const actor=await resolveScamGuardActor(sock,msg,jid)
    if(actor?.role!=='OWNER'){
      logger.warn({jid,messageId:msg.key.id,senderJids:senderJidsFromMessage(msg)},'Scam Guard source command rejected because OWNER identity could not be resolved')
      return false
    }
    await trustScamSourceJid(jid,actor.username)
    await sock.sendMessage(jid,{text:'🛡️ SCAM GUARD — Esta conversación quedó registrada como fuente confiable de reportes.'})
    await audit({actor:actor.username,actorRole:actor.role,action:'SCAM_GUARD_SOURCE_ADDED',source:'WHATSAPP',result:'SUCCESS',metadata:{sourceJid:jid}})
    return true
  }
  const cfg=await getHotScamGuardConfig();if(!cfg.enabled||!(cfg.sourceJids||[]).includes(jid))return false
  const parsed=parseScamReport(text);if(!parsed)return false
  const actor=await resolveScamGuardActor(sock,msg,jid)
  if(!canReport(actor)){
    const senderJids=senderJidsFromMessage(msg)
    await audit({actor:'UNKNOWN',action:'SCAM_GUARD_UNAUTHORIZED_REPORT',source:'WHATSAPP',result:'FAILED',reason:'Mensaje de reporte desde fuente confiable pero autor no es OWNER/ADMIN',metadata:{sourceJid:jid,messageId:msg.key.id,senderJids,parsedPhones:parsed.phones}})
    logger.warn({jid,messageId:msg.key.id,senderJids,parsedPhones:parsed.phones},'Scam Guard report ignored because reporter identity could not be resolved as OWNER/ADMIN')
    try{await sock.sendMessage(jid,{text:'⚠️ *SCAM GUARD* detectó el reporte, pero no pudo validar al remitente como OWNER/ADMIN de CHRONOS. Revisa que ese número esté registrado en CHRONOS_PANEL_USERS.'})}catch{}
    return true
  }
  logger.info({jid,messageId:msg.key.id,actor:actor.username,phones:parsed.phones},'Scam Guard trusted report detected')
  const accepted:string[]=[],rejected:string[]=[]
  for(const phone of parsed.phones){
    try{const entry=await registerScamReport({phone,reason:parsed.reason,actor,source:'WHATSAPP',sourceJid:jid,sourceMessageId:msg.key.id||undefined,sock});accepted.push(String(entry.phoneNumberNormalized))}
    catch(error:any){rejected.push(`${phone}: ${String(error?.message||error)}`)}
  }
  if(accepted.length){await sock.sendMessage(jid,{text:`🛡️ *SCAM GUARD*\n\n✅ ${accepted.length} número(s) añadido(s) a la lista negra global permanente.\n${accepted.map(phone=>`• ${maskPhone(phone)}`).join('\n')}\n\nCHRONOS inició la revisión de los grupos protegidos.`})}
  if(rejected.length){await sock.sendMessage(jid,{text:`⚠️ SCAM GUARD no pudo registrar:\n${rejected.join('\n')}`})}
  return true
}

export async function listScamEntries(){return ScamEntry.find().sort({status:1,lastReportedAt:-1}).lean()}
export async function listScamReports(limit=200){return ScamReport.find().sort({createdAt:-1}).limit(Math.min(Math.max(limit,1),500)).lean()}

export async function revokeScamEntry(entryId:string,actor:ScamGuardActor){
  if(actor.role!=='OWNER')throw new AppError('FORBIDDEN','Solo OWNER puede retirar un bloqueo permanente de Scam Guard',403)
  const entry=await ScamEntry.findById(entryId);if(!entry)throw new AppError('NOT_FOUND','Registro Scam Guard no encontrado',404)
  entry.status='REVOKED';entry.revokedAt=new Date();entry.revokedBy=actor.username;entry.updatedAt=new Date();await entry.save()
  if(entry.ownsBan&&entry.banId)await Ban.updateOne({_id:entry.banId,status:'ACTIVE'},{$set:{status:'REVOKED',revokedAt:new Date()}})
  await audit({actor:actor.username,actorRole:actor.role,action:'SCAM_GUARD_BAN_REVOKED',targetMemberId:entry.memberId,source:'PANEL',result:'SUCCESS',reason:entry.reason,metadata:{entryId:entry._id,phoneNumberNormalized:entry.phoneNumberNormalized}})
  return entry
}
