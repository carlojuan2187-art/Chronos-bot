import { Whitelist } from './whitelist.model.js'
export async function hasBypass(memberId:any,group:any,key:string){ const ors:any[]=[{scope:'GLOBAL'}]; if(group.communityId)ors.push({scope:'COMMUNITY',communityId:group.communityId}); ors.push({scope:'GROUP',groupId:group._id}); const rows=await Whitelist.find({memberId,$or:ors}).lean(); return rows.some((r:any)=>Boolean(r.bypass?.[key])) }
