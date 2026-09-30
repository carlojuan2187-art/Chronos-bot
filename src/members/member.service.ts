import { Member } from './member.model.js'
import { GroupMembership } from './membership.model.js'
import { phoneFromJid } from '../utils/jid.js'
export async function upsertMember(userJid:string,displayName?:string){ return Member.findOneAndUpdate({userJid},{$set:{phoneNumberNormalized:phoneFromJid(userJid),...(displayName?{displayName}:{}),lastSeenAt:new Date(),updatedAt:new Date()},$setOnInsert:{firstSeenAt:new Date(),createdAt:new Date()}},{upsert:true,new:true}) }
export async function setMembership(memberId:any,groupId:any,status:'ACTIVE'|'LEFT'|'REMOVED'|'BANNED'){ const now=new Date(); return GroupMembership.findOneAndUpdate({memberId,groupId},{$set:{status,lastSeenAt:now,...(status==='ACTIVE'?{joinedAt:now,leftAt:null}:{leftAt:now})}},{upsert:true,new:true}) }
