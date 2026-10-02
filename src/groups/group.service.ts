import { Group } from './group.model.js'
import { DEFAULT_GROUP_SETTINGS } from '../config/defaults.js'
import { AppError } from '../errors/app-error.js'
import { participantJids, sameUserJid, uniqueJids } from '../utils/jid.js'
function nextCode(){ return `GRP-${Math.random().toString(36).slice(2,7).toUpperCase()}` }

function botParticipant(meta:any,botIdentity?:{id?:string;lid?:string}){
  const botJids=uniqueJids([botIdentity?.id,botIdentity?.lid])
  return meta.participants?.find((p:any)=>participantJids(p).some((candidate:string)=>botJids.some(bot=>candidate===bot||sameUserJid(candidate,bot))))
}

export async function upsertGroupFromWhatsApp(meta:any, botIdentity?:{id?:string;lid?:string}){
  const bot=botParticipant(meta,botIdentity)
  const isAdmin=Boolean(bot?.admin||bot?.isAdmin||bot?.isSuperAdmin)
  return Group.findOneAndUpdate(
    {groupJid:meta.id},
    {$set:{
      name:meta.subject||meta.id,
      description:meta.desc||'',
      participantsCount:meta.participants?.length||0,
      botIsParticipant:Boolean(bot),
      botIsAdmin:isAdmin,
      status:isAdmin?'ACTIVE':(bot?'NOT_ADMIN':'REMOVED'),
      lastSyncAt:new Date(),
      updatedAt:new Date()
    },$setOnInsert:{
      shortCode:nextCode(),settingsVersion:1,
      antiLink:DEFAULT_GROUP_SETTINGS.antiLink,
      antiBot:DEFAULT_GROUP_SETTINGS.antiBot,
      antiSpam:DEFAULT_GROUP_SETTINGS.antiSpam,
      newMemberProtection:DEFAULT_GROUP_SETTINGS.newMemberProtection,
      welcome:DEFAULT_GROUP_SETTINGS.welcome,
      rules:DEFAULT_GROUP_SETTINGS.rules,
      schedule:DEFAULT_GROUP_SETTINGS.schedule,
      blockedTerms:[],createdAt:new Date()
    }},
    {upsert:true,new:true,setDefaultsOnInsert:true}
  )
}
export async function getGroup(id:string){ const g=await Group.findById(id); if(!g) throw new AppError('GROUP_NOT_FOUND','Grupo no encontrado',404); return g }
export async function updateGroupSettings(id:string,input:any){ const allowed=['antiLink','antiBot','antiSpam','newMemberProtection','welcome','rules','schedule','blockedTerms']; const set:any={updatedAt:new Date()}; for(const k of allowed) if(input[k]!==undefined) set[k]=input[k]; return Group.findByIdAndUpdate(id,{$set:set},{new:true,runValidators:true}) }
