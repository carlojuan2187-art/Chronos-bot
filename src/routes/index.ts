import { Router, type Request } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { loginRateLimit } from '../middleware/rate-limit.js'
import { login,logout,refresh } from '../auth/auth.service.js'
import { rolePermissions } from '../config/permissions.js'
import { Group } from '../groups/group.model.js'
import { Community } from '../communities/community.model.js'
import { Member } from '../members/member.model.js'
import { Warning } from '../moderation/warning.model.js'
import { Ban } from '../moderation/ban.model.js'
import { Whitelist } from '../moderation/whitelist.model.js'
import { AuditLog } from '../audit/audit.model.js'
import { updateGroupSettings,getGroup } from '../groups/group.service.js'
import { resolveGroupAndMember,warn,kick,ban,globalBan,revokeBan } from '../moderation/moderation.service.js'
import { whatsappPublicState } from '../whatsapp/state.js'
import { reconnectWhatsApp } from '../whatsapp/whatsapp.client.js'
import { syncGroups } from '../whatsapp/whatsapp.sync.js'
import { Announcement } from '../announcements/announcement.model.js'
import { sendAnnouncement } from '../announcements/announcement.service.js'
import { ScheduledMessage } from '../scheduler/scheduled-message.model.js'
import { nextRun } from '../scheduler/scheduler.service.js'
import { begin2FA,confirm2FA,get2FAStatus } from '../auth/totp.service.js'
import { AppError } from '../errors/app-error.js'
import { authenticatePreAuth } from '../middleware/preauth.js'
import { forceGroupMode } from '../scheduler/group-schedule.service.js'
import { BotAccessRule } from '../moderation/bot-access.model.js'
import { clearBotAccessCache } from '../moderation/bot-access.service.js'
import { normalizePhone } from '../utils/jid.js'
import { getScamGuardConfig,listScamEntries,listScamReports,registerScamReport,revokeScamEntry,updateScamGuardConfig } from '../scam-guard/scam-guard.service.js'


function routeParam(req: Request, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError('VALIDATION_ERROR', `Parámetro de ruta inválido: ${name}`, 400)
  }
  return value
}


const botAccessBase=z.object({
  name:z.string().min(1),
  phone:z.string().optional(),
  userJid:z.string().optional(),
  access:z.enum(['ALLOW','BLOCK']).default('ALLOW'),
  scope:z.enum(['GROUP','COMMUNITY','GLOBAL']),
  groupId:z.string().nullable().optional(),
  communityId:z.string().nullable().optional(),
  bypass:z.object({antiBot:z.boolean().default(true),antiLink:z.boolean().default(true),antiSpam:z.boolean().default(true),blockedContent:z.boolean().default(false)}).optional(),
  status:z.enum(['ACTIVE','SUSPENDED']).default('ACTIVE'),
  notes:z.string().optional(),
})
const botAccessSchema=botAccessBase.superRefine((value,ctx)=>{
  const phone=normalizePhone(value.phone||'')
  if(!phone&&!value.userJid)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Debes indicar teléfono o JID del bot'})
  if(value.scope==='GROUP'&&!value.groupId)ctx.addIssue({code:z.ZodIssueCode.custom,message:'groupId es obligatorio para alcance GROUP'})
  if(value.scope==='COMMUNITY'&&!value.communityId)ctx.addIssue({code:z.ZodIssueCode.custom,message:'communityId es obligatorio para alcance COMMUNITY'})
})

export const apiRouter=Router()
apiRouter.post('/auth/login',loginRateLimit,async(req,res)=>{const b=z.object({username:z.string(),password:z.string(),totp:z.string().optional()}).parse(req.body);res.json({success:true,data:await login(b,{ip:req.ip,userAgent:req.get('user-agent')})})})
apiRouter.post('/auth/refresh',async(req,res)=>{const b=z.object({refreshToken:z.string()}).parse(req.body);res.json({success:true,data:await refresh(b.refreshToken)})})
apiRouter.post('/auth/logout',async(req,res)=>{const b=z.object({refreshToken:z.string()}).parse(req.body);await logout(b.refreshToken);res.json({success:true,data:{loggedOut:true}})})
apiRouter.post('/auth/2fa/setup',authenticatePreAuth,async(req,res)=>{const secret=await begin2FA(req.admin!.username);res.json({success:true,data:{secret,otpauthUrl:`otpauth://totp/CHRONOS:${encodeURIComponent(req.admin!.username)}?secret=${secret}&issuer=CHRONOS`}})})
apiRouter.post('/auth/2fa/confirm',authenticatePreAuth,async(req,res)=>{const {token}=z.object({token:z.string().length(6)}).parse(req.body);const result=await confirm2FA(req.admin!.username,token);if(!result.ok)throw new AppError('UNAUTHORIZED','Código 2FA inválido',401);res.json({success:true,data:{enabled:true,recoveryCodes:result.recoveryCodes}})})
apiRouter.use(authenticate)
apiRouter.get('/auth/me',async(req,res)=>res.json({success:true,data:{...req.admin,permissions:rolePermissions(req.admin!.role),twoFactor:await get2FAStatus(req.admin!.username)}}))
apiRouter.get('/system/status',authorize('groups.read'),async(_req,res)=>res.json({success:true,data:{whatsapp:whatsappPublicState}}))
apiRouter.get('/whatsapp/status',authorize('groups.read'),async(_req,res)=>res.json({success:true,data:whatsappPublicState}))
apiRouter.post('/whatsapp/reconnect',authorize('whatsapp.manage'),async(_req,res)=>{await reconnectWhatsApp();res.json({success:true,data:{started:true}})})
apiRouter.post('/sync/groups',authorize('groups.manage'),async(_req,res)=>res.json({success:true,data:await syncGroups()}))
apiRouter.get('/communities',authorize('groups.read'),async(_req,res)=>res.json({success:true,data:await Community.find().sort({name:1}).lean()}))
apiRouter.post('/communities',authorize('groups.manage'),async(req,res)=>{const b=z.object({name:z.string().min(1),description:z.string().optional()}).parse(req.body);res.json({success:true,data:await Community.create({...b,status:'ACTIVE'})})})
apiRouter.get('/groups',authorize('groups.read'),async(req,res)=>{const q:any={};if(req.query.communityId)q.communityId=req.query.communityId;if(req.query.status)q.status=req.query.status;res.json({success:true,data:await Group.find(q).sort({name:1}).lean()})})
apiRouter.get('/groups/:id',authorize('groups.read'),async(req,res)=>res.json({success:true,data:await getGroup(routeParam(req,'id'))}))
apiRouter.patch('/groups/:id/settings',authorize('groups.manage'),async(req,res)=>res.json({success:true,data:await updateGroupSettings(routeParam(req,'id'),req.body)}))
apiRouter.post('/groups/:id/settings/copy',authorize('groups.manage'),async(req,res)=>{const b=z.object({targetGroupIds:z.array(z.string()).min(1),sections:z.array(z.enum(['antiLink','antiBot','antiSpam','newMemberProtection','welcome','rules','schedule','blockedTerms'])).min(1)}).parse(req.body);const source=await getGroup(routeParam(req,'id'));const set:any={updatedAt:new Date()};for(const section of b.sections)set[section]=(source as any)[section];const result=await Group.updateMany({_id:{$in:b.targetGroupIds}},{$set:set});res.json({success:true,data:{modified:result.modifiedCount}})})
apiRouter.patch('/groups/:id/community',authorize('groups.manage'),async(req,res)=>{const b=z.object({communityId:z.string().nullable()}).parse(req.body);res.json({success:true,data:await Group.findByIdAndUpdate(routeParam(req,'id'),{$set:{communityId:b.communityId||null,updatedAt:new Date()}},{new:true})})})
apiRouter.post('/groups/:id/open',authorize('groups.manage'),async(req,res)=>res.json({success:true,data:await forceGroupMode(routeParam(req,'id'),'OPEN')}))
apiRouter.post('/groups/:id/close',authorize('groups.manage'),async(req,res)=>res.json({success:true,data:await forceGroupMode(routeParam(req,'id'),'CLOSED')}))
apiRouter.post('/groups/:id/schedule/resume',authorize('groups.manage'),async(req,res)=>res.json({success:true,data:await forceGroupMode(routeParam(req,'id'),null)}))
apiRouter.post('/groups/:groupId/members/:memberId/warn',authorize('members.warn'),async(req,res)=>{const {group,member}=await resolveGroupAndMember(routeParam(req,'groupId'),routeParam(req,'memberId'));const reason=String(req.body.reason||'Advertencia manual');res.json({success:true,data:await warn(group,member,'MANUAL',reason,'PANEL',req.admin!.username,new Date(Date.now()+30*86400000))})})
apiRouter.post('/groups/:groupId/members/:memberId/kick',authorize('members.kick'),async(req,res)=>{const {group,member}=await resolveGroupAndMember(routeParam(req,'groupId'),routeParam(req,'memberId'));await kick(group,member,String(req.body.reason||'Expulsión manual'),'PANEL',req.admin!.username);res.json({success:true,data:{kicked:true}})})
apiRouter.post('/groups/:groupId/members/:memberId/ban',authorize('members.groupBan'),async(req,res)=>{const {group,member}=await resolveGroupAndMember(routeParam(req,'groupId'),routeParam(req,'memberId'));res.json({success:true,data:await ban(group,member,'GROUP',String(req.body.reason||'Ban de grupo'),req.admin!.username)})})
apiRouter.post('/communities/:communityId/members/:memberId/ban',authorize('members.communityBan'),async(req,res)=>{const g=await Group.findOne({communityId:routeParam(req,'communityId')});const m=await Member.findById(routeParam(req,'memberId'));if(!g||!m)throw new AppError('NOT_FOUND','Comunidad/miembro no encontrado',404);res.json({success:true,data:await ban(g,m,'COMMUNITY',String(req.body.reason||'Ban de comunidad'),req.admin!.username)})})
apiRouter.post('/members/:memberId/global-ban',authorize('members.globalBan'),async(req,res)=>{const m=await Member.findById(routeParam(req,'memberId'));if(!m)throw new AppError('MEMBER_NOT_FOUND','Miembro no encontrado',404);res.json({success:true,data:await globalBan(m,String(req.body.reason||'Ban global'),req.admin!.username)})})
apiRouter.get('/members',authorize('members.read'),async(req,res)=>{const limit=Math.min(Number(req.query.limit||50),100);const page=Math.max(Number(req.query.page||1),1);res.json({success:true,data:await Member.find().skip((page-1)*limit).limit(limit).sort({lastSeenAt:-1}).lean()})})
apiRouter.get('/warnings',authorize('members.read'),async(req,res)=>res.json({success:true,data:await Warning.find(req.query.memberId?{memberId:req.query.memberId}:{}).sort({createdAt:-1}).limit(500).lean()}))
apiRouter.post('/warnings/:id/revoke',authorize('members.warn'),async(req,res)=>{const w=await Warning.findByIdAndUpdate(routeParam(req,'id'),{$set:{status:'REVOKED',revokedAt:new Date()}},{new:true});res.json({success:true,data:w})})
apiRouter.get('/bans',authorize('members.read'),async(_req,res)=>res.json({success:true,data:await Ban.find().sort({createdAt:-1}).limit(500).lean()}))
apiRouter.post('/bans/:id/revoke',authorize('members.groupBan'),async(req,res)=>res.json({success:true,data:await revokeBan(routeParam(req,'id'))}))
apiRouter.get('/bot-access',authorize('bots.manage'),async(_req,res)=>res.json({success:true,data:await BotAccessRule.find().sort({createdAt:-1}).lean()}))
apiRouter.post('/bot-access',authorize('bots.manage'),async(req,res)=>{const b=botAccessSchema.parse(req.body);const phone=normalizePhone(b.phone||'');const doc=await BotAccessRule.create({name:b.name,phoneNumberNormalized:phone,userJid:b.userJid||'',alternateJids:[],access:b.access,scope:b.scope,groupId:b.scope==='GROUP'?b.groupId:null,communityId:b.scope==='COMMUNITY'?b.communityId:null,bypass:{antiBot:b.bypass?.antiBot!==false,antiLink:b.bypass?.antiLink!==false,antiSpam:b.bypass?.antiSpam!==false,blockedContent:Boolean(b.bypass?.blockedContent)},status:b.status,notes:b.notes||'',createdBy:req.admin!.username});clearBotAccessCache();res.json({success:true,data:doc})})
apiRouter.patch('/bot-access/:id',authorize('bots.manage'),async(req,res)=>{const patch=botAccessBase.partial().parse(req.body);const current=await BotAccessRule.findById(routeParam(req,'id'));if(!current)throw new AppError('NOT_FOUND','Regla de bot no encontrada',404);const b=botAccessSchema.parse({name:patch.name??current.name,phone:patch.phone??current.phoneNumberNormalized,userJid:patch.userJid??current.userJid,access:patch.access??current.access,scope:patch.scope??current.scope,groupId:patch.groupId!==undefined?patch.groupId:current.groupId?String(current.groupId):null,communityId:patch.communityId!==undefined?patch.communityId:current.communityId?String(current.communityId):null,bypass:patch.bypass??current.bypass,status:patch.status??current.status,notes:patch.notes??current.notes});current.name=b.name;current.phoneNumberNormalized=normalizePhone(b.phone||'');current.userJid=b.userJid||'';current.access=b.access;current.scope=b.scope;current.groupId=b.scope==='GROUP'?(b.groupId as any):null;current.communityId=b.scope==='COMMUNITY'?(b.communityId as any):null;current.bypass={antiBot:b.bypass?.antiBot!==false,antiLink:b.bypass?.antiLink!==false,antiSpam:b.bypass?.antiSpam!==false,blockedContent:Boolean(b.bypass?.blockedContent)};current.status=b.status;current.notes=b.notes||'';current.updatedAt=new Date();await current.save();clearBotAccessCache();res.json({success:true,data:current})})
apiRouter.delete('/bot-access/:id',authorize('bots.manage'),async(req,res)=>{const doc=await BotAccessRule.findByIdAndDelete(routeParam(req,'id'));if(!doc)throw new AppError('NOT_FOUND','Regla de bot no encontrada',404);clearBotAccessCache();res.json({success:true,data:{deleted:true}})})
apiRouter.get('/scam-guard/config',authorize('scamGuard.read'),async(_req,res)=>res.json({success:true,data:await getScamGuardConfig()}))
apiRouter.patch('/scam-guard/config',authorize('scamGuard.configure'),async(req,res)=>{const b=z.object({enabled:z.boolean().optional(),sourceJids:z.array(z.string().min(4)).optional(),publicAlertEnabled:z.boolean().optional(),scanExistingGroups:z.boolean().optional(),actionDelayMs:z.number().int().min(250).max(10000).optional()}).parse(req.body);res.json({success:true,data:await updateScamGuardConfig(b,req.admin!.username)})})
apiRouter.get('/scam-guard/entries',authorize('scamGuard.read'),async(_req,res)=>res.json({success:true,data:await listScamEntries()}))
apiRouter.get('/scam-guard/reports',authorize('scamGuard.read'),async(req,res)=>res.json({success:true,data:await listScamReports(Number(req.query.limit||200))}))
apiRouter.post('/scam-guard/report',authorize('scamGuard.manage'),async(req,res)=>{const b=z.object({phone:z.string().min(8),reason:z.string().max(500).optional()}).parse(req.body);res.json({success:true,data:await registerScamReport({phone:b.phone,reason:b.reason,actor:req.admin!,source:'PANEL'})})})
apiRouter.post('/scam-guard/entries/:id/revoke',authorize('scamGuard.revoke'),async(req,res)=>res.json({success:true,data:await revokeScamEntry(routeParam(req,'id'),req.admin!)}))

apiRouter.get('/whitelist',authorize('whitelist.manage'),async(_req,res)=>res.json({success:true,data:await Whitelist.find().lean()}))
apiRouter.post('/whitelist',authorize('whitelist.manage'),async(req,res)=>res.json({success:true,data:await Whitelist.create({...req.body,createdBy:req.admin!.username})}))
apiRouter.delete('/whitelist/:id',authorize('whitelist.manage'),async(req,res)=>{await Whitelist.findByIdAndDelete(routeParam(req,'id'));res.json({success:true,data:{deleted:true}})})
apiRouter.get('/audit',authorize('audit.read'),async(req,res)=>{const q:any={};for(const k of ['action','source','result','groupId','communityId','targetMemberId','actor'])if(req.query[k])q[k]=req.query[k];res.json({success:true,data:await AuditLog.find(q).sort({createdAt:-1}).limit(Math.min(Number(req.query.limit||100),500)).lean()})})
apiRouter.post('/announcements',authorize('announcements.manage'),async(req,res)=>res.json({success:true,data:await Announcement.create({...req.body,createdBy:req.admin!.username})}))
apiRouter.get('/announcements',authorize('announcements.manage'),async(_req,res)=>res.json({success:true,data:await Announcement.find().sort({createdAt:-1}).limit(200).lean()}))
apiRouter.post('/announcements/:id/send',authorize('announcements.manage'),async(req,res)=>res.json({success:true,data:await sendAnnouncement(routeParam(req,'id'))}))
apiRouter.post('/announcements/:id/cancel',authorize('announcements.manage'),async(req,res)=>res.json({success:true,data:await Announcement.findByIdAndUpdate(routeParam(req,'id'),{$set:{status:'CANCELLED',completedAt:new Date()}},{new:true})}))
apiRouter.post('/schedules',authorize('schedules.manage'),async(req,res)=>{const body=req.body;const nr=nextRun(body.schedule,new Date());res.json({success:true,data:await ScheduledMessage.create({...body,nextRunAt:nr,createdBy:req.admin!.username})})})
apiRouter.get('/schedules',authorize('schedules.manage'),async(_req,res)=>res.json({success:true,data:await ScheduledMessage.find().sort({createdAt:-1}).limit(200).lean()}))
apiRouter.post('/schedules/:id/pause',authorize('schedules.manage'),async(req,res)=>res.json({success:true,data:await ScheduledMessage.findByIdAndUpdate(routeParam(req,'id'),{$set:{status:'PAUSED',updatedAt:new Date()}},{new:true})}))
apiRouter.post('/schedules/:id/resume',authorize('schedules.manage'),async(req,res)=>{const s=await ScheduledMessage.findById(routeParam(req,'id'));if(!s)throw new AppError('NOT_FOUND','Programación no encontrada',404);s.status='ACTIVE';s.nextRunAt=nextRun((s as any).schedule,new Date());s.updatedAt=new Date();await s.save();res.json({success:true,data:s})})
apiRouter.post('/schedules/:id/cancel',authorize('schedules.manage'),async(req,res)=>res.json({success:true,data:await ScheduledMessage.findByIdAndUpdate(routeParam(req,'id'),{$set:{status:'CANCELLED',updatedAt:new Date()}},{new:true})}))
