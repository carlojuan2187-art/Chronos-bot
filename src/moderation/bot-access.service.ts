import type { WAMessage } from '@whiskeysockets/baileys'
import { BotAccessRule } from './bot-access.model.js'
import { normalizePhone, uniqueJids } from '../utils/jid.js'

const CACHE_TTL_MS=30_000
const cache=new Map<string,{at:number,value:any|null}>()

function groupKey(group:any,member:any,ids:string[],phones:string[]){return `${String(group?._id||'')}:${String(member?._id||member?.userJid||'')}:${ids.join(',')}:${phones.join(',')}`}
function objectIdString(value:any){return value?String(value):''}
function scopeRank(rule:any,group:any){
  if(rule.scope==='GROUP'&&objectIdString(rule.groupId)===objectIdString(group?._id))return 3
  if(rule.scope==='COMMUNITY'&&objectIdString(rule.communityId)===objectIdString(group?.communityId))return 2
  if(rule.scope==='GLOBAL')return 1
  return 0
}

export function clearBotAccessCache(){cache.clear()}

export async function botAccessForMember(member:any,group:any,extraJids:string[]=[],extraPhones:string[]=[]){
  const ids=uniqueJids([member?.userJid,...(member?.alternateJids||[]),...extraJids])
  const phones=[...new Set([normalizePhone(String(member?.phoneNumberNormalized||'')),...extraPhones.map(v=>normalizePhone(String(v||'')))].filter(Boolean))]
  const key=groupKey(group,member,ids,phones),cached=cache.get(key)
  if(cached&&Date.now()-cached.at<CACHE_TTL_MS)return cached.value

  const identityOr:any[]=[]
  if(phones.length)identityOr.push({phoneNumberNormalized:{$in:phones}})
  if(ids.length)identityOr.push({userJid:{$in:ids}},{alternateJids:{$in:ids}})
  if(identityOr.length===0){cache.set(key,{at:Date.now(),value:null});return null}

  const scopeOr:any[]=[{scope:'GLOBAL'}]
  if(group?.communityId)scopeOr.push({scope:'COMMUNITY',communityId:group.communityId})
  if(group?._id)scopeOr.push({scope:'GROUP',groupId:group._id})

  const rows=await BotAccessRule.find({status:'ACTIVE',$and:[{$or:identityOr},{$or:scopeOr}]}).lean()
  rows.sort((a:any,b:any)=>{
    const rank=scopeRank(b,group)-scopeRank(a,group)
    if(rank!==0)return rank
    if(a.access!==b.access)return a.access==='BLOCK'?-1:1
    return new Date(b.updatedAt||b.createdAt||0).getTime()-new Date(a.updatedAt||a.createdAt||0).getTime()
  })
  const value=rows[0]||null
  cache.set(key,{at:Date.now(),value})
  if(value?._id)void BotAccessRule.updateOne({_id:value._id},{$set:{lastMatchedAt:new Date()}}).catch(()=>{})
  return value
}

export function accessBypass(rule:any,key:'antiBot'|'antiLink'|'antiSpam'|'blockedContent'){
  return Boolean(rule?.access==='ALLOW'&&rule?.bypass?.[key])
}

export function messageIdentityCandidates(msg:WAMessage){
  const key:any=msg.key
  return uniqueJids([key?.participantPn,key?.senderPn,key?.participant,key?.participantLid,key?.senderLid])
}
