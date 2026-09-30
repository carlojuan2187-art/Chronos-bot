import argon2 from 'argon2'
import { env } from '../config/env.js'
import { AppError } from '../errors/app-error.js'
import { signAccessToken, signPreAuthToken } from './token.service.js'
import { AdminSession } from './admin-session.model.js'
import { randomToken, sha256 } from '../utils/crypto.js'
import { get2FAStatus, verify2FA } from './totp.service.js'

export function findPanelUser(username:string) { return env.panelUsers.find(u=>u.username.toLowerCase()===username.toLowerCase()) }
export function findAdminByPhone(phone:string) { return env.panelUsers.find(u=>u.phone===phone) }

export async function login(input:{username:string;password:string;totp?:string}, meta:{ip?:string;userAgent?:string}) {
  const user=findPanelUser(input.username); if(!user || !(await argon2.verify(user.passwordHash,input.password))) throw new AppError('UNAUTHORIZED','Credenciales incorrectas',401)
  const required=user.role==='OWNER'||user.role==='ADMIN'; const two=await get2FAStatus(user.username)
  if(required && !two.enabled) return { requires2FASetup:true, preAuthToken:await signPreAuthToken(user.username,user.role), admin:{username:user.username,role:user.role} }
  if(two.enabled && !input.totp) return { requires2FA:true, admin:{username:user.username,role:user.role} }
  if(two.enabled && input.totp && !(await verify2FA(user.username,input.totp))) throw new AppError('UNAUTHORIZED','Código 2FA inválido',401)
  const accessToken=await signAccessToken(user.username,user.role); const refreshToken=randomToken(48); const expiresAt=new Date(Date.now()+env.REFRESH_TOKEN_TTL_DAYS*86400000)
  await AdminSession.create({adminId:user.username,refreshTokenHash:sha256(refreshToken),ipAddress:meta.ip,userAgent:meta.userAgent,createdAt:new Date(),lastUsedAt:new Date(),expiresAt})
  return { accessToken, refreshToken, admin:{username:user.username,phone:user.phone,role:user.role} }
}

export async function refresh(refreshToken:string) { const hash=sha256(refreshToken); const s=await AdminSession.findOne({refreshTokenHash:hash,revokedAt:null,expiresAt:{$gt:new Date()}}); if(!s) throw new AppError('UNAUTHORIZED','Sesión inválida',401); const user=findPanelUser(s.adminId); if(!user) throw new AppError('UNAUTHORIZED','Administrador ya no autorizado',401); s.revokedAt=new Date(); await s.save(); const next=randomToken(48); await AdminSession.create({adminId:user.username,refreshTokenHash:sha256(next),createdAt:new Date(),lastUsedAt:new Date(),expiresAt:new Date(Date.now()+env.REFRESH_TOKEN_TTL_DAYS*86400000)}); return {accessToken:await signAccessToken(user.username,user.role),refreshToken:next} }
export async function logout(refreshToken:string){ await AdminSession.updateOne({refreshTokenHash:sha256(refreshToken),revokedAt:null},{$set:{revokedAt:new Date()}}) }
