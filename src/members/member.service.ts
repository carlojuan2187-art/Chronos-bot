import { Member } from './member.model.js'
import { GroupMembership } from './membership.model.js'
import { isPhoneJid, participantJids, phoneFromJid, uniqueJids } from '../utils/jid.js'

export async function upsertMember(userJid:string,displayName?:string,aliases:string[]=[]){
  const allJids=uniqueJids([userJid,...aliases])
  const pnJid=allJids.find(isPhoneJid)
  const phone=pnJid ? phoneFromJid(pnJid) : ''
  const or:any[]=[{userJid:{$in:allJids}},{alternateJids:{$in:allJids}}]
  if(phone) or.unshift({phoneNumberNormalized:phone})

  let member=await Member.findOne({$or:or})
  if(!member){
    const canonical=pnJid||userJid
    member=new Member({
      userJid:canonical,
      alternateJids:allJids.filter(j=>j!==canonical),
      ...(phone?{phoneNumberNormalized:phone}:{}),
      ...(displayName?{displayName}:{}),
      firstSeenAt:new Date(),
      lastSeenAt:new Date(),
      createdAt:new Date(),
      updatedAt:new Date(),
    })
    await member.save()
    return member
  }

  const known=uniqueJids([member.userJid,...((member as any).alternateJids||[]),...allJids])
  ;(member as any).alternateJids=known.filter(j=>j!==member.userJid)
  if(phone) member.phoneNumberNormalized=phone
  if(displayName) member.displayName=displayName
  member.lastSeenAt=new Date()
  member.updatedAt=new Date()
  await member.save()
  return member
}

export async function upsertMemberFromParticipant(participant:any,displayName?:string){
  const ids=participantJids(participant)
  const canonical=participant?.jid||participant?.id||participant?.lid
  if(!canonical) throw new Error('PARTICIPANT_ID_MISSING')
  return upsertMember(canonical,displayName||participant?.name||participant?.notify,ids)
}

export async function setMembership(memberId:any,groupId:any,status:'ACTIVE'|'LEFT'|'REMOVED'|'BANNED'){
  const now=new Date()
  return GroupMembership.findOneAndUpdate(
    {memberId,groupId},
    {$set:{status,lastSeenAt:now,...(status==='ACTIVE'?{joinedAt:now,leftAt:null}:{leftAt:now})}},
    {upsert:true,new:true}
  )
}
