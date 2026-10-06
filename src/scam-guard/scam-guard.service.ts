import type { WASocket,WAMessage } from '@whiskeysockets/baileys'
import { ScamGuardConfig } from './scam-guard-config.model.js'
import { ScamEntry } from './scam-entry.model.js'
import { ScamReport } from './scam-report.model.js'
import { parseScamReport,maskPhone } from './scam-guard.parser.js'
import { env,type PanelUser } from '../config/env.js'

type ScamGuardActor=Pick<PanelUser,'username'|'phone'|'role'>
import { findAdminByPhone } from '../auth/auth.service.js'
import { phoneCandidatesFromMessageKey,normalizePhone,participantJids,phoneFromJid,isPhoneJid,sameUserJid,uniqueJids } from '../utils/jid.js'
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
const pendingGroupEnforcement=new Set<string>()
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
function canReport(actor:ScamGuardActor|null){return Boolean(actor&&(actor.role==='OWNER'||actor.role==='ADMIN'))}
function protectedPhone(phone:string){return env.panelUsers.some(user=>user.phone===phone)||phone===normalizePhone(env.WHATSAPP_NUMBER)}

export async function getScamGuardConfig(){
  const doc=await ScamGuardConfig.findByIdAndUpdate('singleton',{$setOnInsert:{_id:'singleton',...DEFAULT_CONFIG,updatedAt:new Date()}},{upsert:true,new:true,setDefaultsOnInsert:true})
  if(!doc)throw new Error('SCAM_GUARD_CONFIG_UNAVAILABLE')
  return doc
}

function normalizeSourceJid(value:string){return String(value||'').trim().toLowerCase()}
function snapshotConfig(doc:any){return{enabled:doc.enabled!==false,sourceJids:[...(doc.sourceJids||[])].map((value:any)=>normalizeSourceJid(String(value))).filter(Boolean),publicAlertEnabled:doc.publicAlertEnabled!==false,scanExistingGroups:doc.scanExistingGroups!==false,actionDelayMs:Number(doc.actionDelayMs||900)}}
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
  if(input.sourceJids!==undefined)set.sourceJids=[...new Set((input.sourceJids as string[]).map(v=>normalizeSourceJid(String(v))).filter(Boolean))]
  await ScamGuardConfig.updateOne({_id:'singleton'},{$set:set})
  const doc=await getScamGuardConfig();hotConfig=snapshotConfig(doc);hotConfigAt=Date.now();return doc
}

export async function trustScamSourceJid(jid:string,actor:string){
  const cfg=await getScamGuardConfig()
  const sourceJids=[...new Set([...(cfg.sourceJids||[]).map((value:any)=>normalizeSourceJid(String(value))),normalizeSourceJid(jid)])]
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

function participantPhones(participant:any){
  const raw=uniqueJids([
    ...participantJids(participant),
    participant?.phoneNumber,participant?.phone_number,participant?.pn,participant?.participantPn,participant?.participantAlt,
  ])
  const phones:string[]=[]
  for(const value of raw){
    const phone=isPhoneJid(value)?phoneFromJid(value):(!value.includes('@')?normalizePhone(value):'')
    if(phone&&phone.length>=8&&phone.length<=15&&!phones.includes(phone))phones.push(phone)
  }
  return phones
}
function participantPhone(participant:any){return participantPhones(participant)[0]||''}

async function withTimeout<T>(promise:Promise<T>,ms:number,label:string):Promise<T>{
  let timer:NodeJS.Timeout|undefined
  try{
    return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}_TIMEOUT`)),ms)})])
  }finally{if(timer)clearTimeout(timer)}
}

async function fetchGroupMetadataResilient(sock:WASocket,groupJid:string){
  try{return await withTimeout(sock.groupMetadata(groupJid),5000,'GROUP_METADATA')}
  catch(firstError){
    logger.warn({err:firstError,groupJid},'Scam Guard groupMetadata failed; trying full participating-groups snapshot')
    try{
      const all:any=await withTimeout(sock.groupFetchAllParticipating(),10000,'GROUP_FETCH_ALL')
      const meta=all?.[groupJid]
      if(meta)return meta
    }catch(secondError){logger.warn({err:secondError,groupJid},'Scam Guard participating-groups fallback failed')}
    throw firstError
  }
}

async function resolveJoinParticipant(sock:WASocket,groupJid:string,userJid:string){
  const delays=[0,500,1500]
  let lastMeta:any=null
  for(const delay of delays){
    if(delay)await sleep(delay)
    try{
      const meta:any=await fetchGroupMetadataResilient(sock,groupJid);lastMeta=meta
      const participant=meta?.participants?.find((p:any)=>participantJids(p).some(id=>id===userJid||sameUserJid(id,userJid)))
      if(participant)return{meta,participant}
    }catch(error){
      logger.warn({err:error,groupJid,userJid,delay},'Scam Guard could not refresh joined participant metadata')
    }
  }
  return{meta:lastMeta,participant:null}
}

async function phoneFromJoinIdentity(sock:WASocket,groupJid:string,userJid:string){
  if(isPhoneJid(userJid))return{phone:phoneFromJid(userJid),meta:null,participant:null,member:null}
  try{
    const cached:any=await Member.findOne({$or:[{userJid},{alternateJids:userJid}]}).lean()
    if(cached?.phoneNumberNormalized)return{phone:normalizePhone(String(cached.phoneNumberNormalized)),meta:null,participant:null,member:cached}
  }catch(error){logger.warn({err:error,groupJid,userJid},'Scam Guard join cache lookup failed')}
  const resolved=await resolveJoinParticipant(sock,groupJid,userJid)
  if(!resolved.participant)return{phone:'',meta:resolved.meta,participant:null,member:null}
  const aliases=uniqueJids([userJid,...participantJids(resolved.participant)])
  const canonical=resolved.participant.jid||resolved.participant.id||resolved.participant.lid||userJid
  const member=await upsertMember(canonical,undefined,aliases)
  const phone=participantPhone(resolved.participant)||normalizePhone(String((member as any).phoneNumberNormalized||''))
  return{phone,meta:resolved.meta,participant:resolved.participant,member}
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

async function removeEntryFromGroup(sock:WASocket,entry:any,group:any,participantHint?:string,resolvedMeta?:any,resolvedParticipant?:any){
  const meta=resolvedMeta||await sock.groupMetadata(group.groupJid)
  // The persisted group state is authoritative enough to attempt the action.
  // On LID-addressed groups Baileys can fail to resolve the bot PN from a
  // single metadata response even though CHRONOS is still an administrator.
  if(!group.botIsAdmin&&!botIsAdmin(meta,sock))return false
  const phone=String(entry.phoneNumberNormalized)
  const participant=resolvedParticipant||meta.participants?.find((p:any)=>participantPhone(p)===phone||(participantHint&&participantJids(p).some(id=>id===participantHint||sameUserJid(id,participantHint))))
  if(!participant)return false
  const actualPhone=participantPhone(participant)
  if(actualPhone&&actualPhone!==phone)return false
  const participantIds=participantJids(participant)
  const lidJid=participantIds.find((jid:string)=>jid.endsWith('@lid'))
  const phoneJid=participantIds.find(isPhoneJid)
  const actionJid=meta?.addressingMode==='lid'
    ? (lidJid||(participantHint?.endsWith('@lid')?participantHint:undefined)||participant.id||participant.lid||participant.jid)
    : (phoneJid||(participantHint&&isPhoneJid(participantHint)?participantHint:undefined)||participant.jid||participant.id||participant.lid||participantHint)
  if(!actionJid)return false
  logger.warn({groupJid:group.groupJid,phone,participantHint,addressingMode:meta?.addressingMode,actionJid,participantIds},'Scam Guard issuing permanent-ban removal')
  const result=await sock.groupParticipantsUpdate(group.groupJid,[actionJid],'remove')
  const rejected=(result||[]).find((row:any)=>row?.status&&String(row.status)!=='200')
  if(rejected)throw new Error(`WhatsApp rechazó la expulsión Scam Guard (status ${String(rejected.status)})`)
  if(entry.memberId)await setMembership(entry.memberId,group._id,'BANNED')
  await ScamEntry.updateOne({_id:entry._id},{$inc:{detectionCount:1,removalCount:1},$set:{lastDetectedAt:new Date(),lastRemovedAt:new Date(),updatedAt:new Date()}})
  await audit({actor:'CHRONOS',action:'SCAM_GUARD_PERMANENT_BAN_ENFORCED',groupId:group._id,communityId:group.communityId,targetMemberId:entry.memberId,source:'SYSTEM',result:'SUCCESS',reason:entry.reason,metadata:{entryId:entry._id,phoneNumberNormalized:phone,actionJid}})
  logger.info({groupJid:group.groupJid,phone,actionJid},'Scam Guard removed blacklisted participant')
  await publicScamAlert(sock,group,entry)
  return true
}

async function enforceGroupBlacklistOnce(sock:WASocket,group:any){
  const cfg=await getHotScamGuardConfig();if(!cfg.enabled)return 0
  const entries=await ScamEntry.find({status:'ACTIVE'}).lean()
  if(!entries.length)return 0
  const byPhone=new Map<string,any>()
  for(const entry of entries as any[])byPhone.set(String(entry.phoneNumberNormalized),entry)
  const meta:any=await fetchGroupMetadataResilient(sock,group.groupJid)
  let removed=0
  for(const participant of meta?.participants||[]){
    const phones=participantPhones(participant)
    const entry=phones.map(phone=>byPhone.get(phone)).find(Boolean) as any
    if(!entry)continue
    logger.warn({groupJid:group.groupJid,phones,entryId:entry._id,participantIds:participantJids(participant)},'Scam Guard group scan matched blacklisted participant')
    try{if(await removeEntryFromGroup(sock,entry,group,undefined,meta,participant))removed++}
    catch(error){logger.error({err:error,groupJid:group.groupJid,phones,entryId:entry._id},'Scam Guard group scan removal failed')}
  }
  return removed
}

export function queueGroupScamGuardEnforcement(sock:WASocket,group:any){
  const key=String(group.groupJid)
  if(pendingGroupEnforcement.has(key))return
  pendingGroupEnforcement.add(key)
  sweepChain=sweepChain.then(async()=>{
    const delays=[1000,3000,7000,15000]
    for(const delay of delays){
      await sleep(delay)
      try{
        const removed=await enforceGroupBlacklistOnce(sock,group)
        logger.info({groupJid:key,removed,delay},'Scam Guard deferred group enforcement completed')
        if(removed>0)break
      }catch(error){logger.warn({err:error,groupJid:key,delay},'Scam Guard deferred group enforcement attempt failed')}
    }
  }).catch(error=>logger.error({err:error,groupJid:key},'Scam Guard deferred group enforcement failed')).finally(()=>pendingGroupEnforcement.delete(key))
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
    logger.info(`Scam Guard evaluating joined participant group=${group.groupJid} user=${userJid}`)
    const identity=await phoneFromJoinIdentity(sock,group.groupJid,userJid)
    const phone=normalizePhone(identity.phone||'')
    if(!phone){
      logger.error(`Scam Guard could not resolve joined participant phone; welcome suppressed group=${group.groupJid} user=${userJid}`)
      queueGroupScamGuardEnforcement(sock,group)
      return true
    }
    logger.info(`Scam Guard resolved join identity group=${group.groupJid} user=${userJid} phone=${phone}`)
    const entry=await ScamEntry.findOne({phoneNumberNormalized:phone,status:'ACTIVE'})
    if(!entry){
      logger.info(`Scam Guard join cleared group=${group.groupJid} user=${userJid} phone=${phone}`)
      return false
    }
    const member=identity.member||await upsertMember(identity.participant?.jid||`${phone}@s.whatsapp.net`,undefined,uniqueJids([userJid,...participantJids(identity.participant||{})]))
    entry.memberId=member._id;await entry.save()
    await setMembership(member._id,group._id,'ACTIVE')
    logger.warn(`Scam Guard MATCH blacklisted join group=${group.groupJid} user=${userJid} phone=${phone} entry=${String(entry._id)}`)

    let removed=false
    const retryDelays=[0,500,1500]
    let meta=identity.meta,participant=identity.participant
    for(const delay of retryDelays){
      if(delay)await sleep(delay)
      try{
        if(!participant){const resolved=await resolveJoinParticipant(sock,group.groupJid,userJid);meta=resolved.meta;participant=resolved.participant}
        removed=await removeEntryFromGroup(sock,entry,group,userJid,meta,participant)
        if(removed)break
        meta=null;participant=null
      }catch(error:any){
        logger.warn({err:error,groupJid:group.groupJid,userJid,phone,delay},'Scam Guard immediate join removal attempt failed')
        meta=null;participant=null
      }
    }

    if(!removed){
      await audit({actor:'CHRONOS',action:'SCAM_GUARD_JOIN_ENFORCEMENT_DEFERRED',groupId:group._id,communityId:group.communityId,targetMemberId:entry.memberId,source:'SYSTEM',result:'FAILED',reason:'El número está en blacklist pero WhatsApp todavía no permitió resolver/expulsar al participante',metadata:{userJid,phone,entryId:entry._id}})
      logger.error(`Scam Guard blacklisted join not removed immediately; welcome suppressed group=${group.groupJid} user=${userJid} phone=${phone}`)
      queueGroupScamGuardEnforcement(sock,group)
    }
    return true
  }catch(error:any){
    logger.error({err:error,groupJid:group.groupJid,userJid},'Scam Guard join enforcement failed; welcome suppressed')
    await audit({actor:'CHRONOS',action:'SCAM_GUARD_JOIN_ENFORCEMENT_FAILED',groupId:group._id,communityId:group.communityId,source:'SYSTEM',result:'FAILED',reason:String(error?.message||error),metadata:{userJid}})
    queueGroupScamGuardEnforcement(sock,group)
    return true
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
  const cfg=await getHotScamGuardConfig();const normalizedJid=normalizeSourceJid(jid);if(!cfg.enabled||!(cfg.sourceJids||[]).includes(normalizedJid))return false
  logger.info({jid:normalizedJid,messageId:msg.key.id,fromMe:Boolean(msg.key.fromMe),senderJids:senderJidsFromMessage(msg),textPreview:text.slice(0,180)},'Scam Guard message received from trusted source')
  const parsed=parseScamReport(text);if(!parsed){
    logger.debug({jid:normalizedJid,messageId:msg.key.id,textPreview:text.slice(0,180)},'Scam Guard trusted-source message did not contain a reportable phone number')
    return false
  }
  const resolvedActor=await resolveScamGuardActor(sock,msg,jid)
  if(resolvedActor&&!canReport(resolvedActor)){
    const senderJids=senderJidsFromMessage(msg)
    await audit({actor:resolvedActor.username,actorRole:resolvedActor.role,action:'SCAM_GUARD_UNAUTHORIZED_REPORT',source:'WHATSAPP',result:'FAILED',reason:'El autor identificado no es OWNER/ADMIN de CHRONOS',metadata:{sourceJid:normalizedJid,messageId:msg.key.id,senderJids,parsedPhones:parsed.phones}})
    logger.warn({jid:normalizedJid,messageId:msg.key.id,actor:resolvedActor.username,role:resolvedActor.role,parsedPhones:parsed.phones},'Scam Guard report rejected because identified reporter is not OWNER/ADMIN')
    return true
  }
  // The configured private source is itself a trust boundary. WhatsApp can
  // deliver group authors only as LID on some devices, so an unresolved LID
  // must not make an otherwise trusted report disappear. When identity can be
  // resolved we preserve the real OWNER/ADMIN; otherwise we attribute the
  // ingestion to the unique OWNER while keeping the unresolved sender JIDs in
  // the audit trail.
  const fallbackOwner=env.panelUsers.find(user=>user.role==='OWNER')!
  const actor:ScamGuardActor=resolvedActor&&canReport(resolvedActor)?resolvedActor:fallbackOwner
  if(!resolvedActor){
    await audit({actor:actor.username,actorRole:actor.role,action:'SCAM_GUARD_TRUSTED_SOURCE_FALLBACK',source:'WHATSAPP',result:'SUCCESS',reason:'Reporte aceptado por provenir de una fuente privada confiable; WhatsApp no expuso una identidad PN resoluble',metadata:{sourceJid:normalizedJid,messageId:msg.key.id,senderJids:senderJidsFromMessage(msg),parsedPhones:parsed.phones}})
    logger.warn({jid:normalizedJid,messageId:msg.key.id,fallbackActor:actor.username,senderJids:senderJidsFromMessage(msg),parsedPhones:parsed.phones},'Scam Guard accepted report via trusted-source fallback because reporter PN could not be resolved')
  }
  logger.info({jid:normalizedJid,messageId:msg.key.id,actor:actor.username,phones:parsed.phones},'Scam Guard trusted report detected')
  const accepted:string[]=[],rejected:string[]=[]
  for(const phone of parsed.phones){
    try{const entry=await registerScamReport({phone,reason:parsed.reason,actor,source:'WHATSAPP',sourceJid:normalizedJid,sourceMessageId:msg.key.id||undefined,sock});accepted.push(String(entry.phoneNumberNormalized))}
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
