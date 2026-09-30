import { Warning } from './warning.model.js'
export async function activeWarnings(memberId:any,groupId:any,type:string){ const now=new Date(); await Warning.updateMany({memberId,groupId,type,status:'ACTIVE',expiresAt:{$lte:now}},{$set:{status:'EXPIRED'}}); return Warning.find({memberId,groupId,type,status:'ACTIVE',expiresAt:{$gt:now}}).sort({createdAt:1}) }
export async function createWarning(input:{memberId:any;groupId:any;communityId?:any;type:string;reason:string;source:string;issuedBy:string;expiresAt:Date}){return Warning.create(input)}
