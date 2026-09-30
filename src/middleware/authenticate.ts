import type { RequestHandler } from 'express'
import { verifyAccessToken } from '../auth/token.service.js'
import { findPanelUser } from '../auth/auth.service.js'
import { AppError } from '../errors/app-error.js'
declare global { namespace Express { interface Request { admin?: { username:string; phone:string; role:'OWNER'|'ADMIN'|'MODERATOR' } } } }
export const authenticate: RequestHandler = async (req,_res,next) => { try { const h=req.header('authorization'); if(!h?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED','Autenticación requerida',401); const {payload}=await verifyAccessToken(h.slice(7)); if(payload.tokenType!=='access') throw new AppError('UNAUTHORIZED','Token inválido',401); const user=findPanelUser(String(payload.sub)); if(!user) throw new AppError('UNAUTHORIZED','Administrador no autorizado',401); req.admin={username:user.username,phone:user.phone,role:user.role}; next() } catch(e){ next(e instanceof AppError?e:new AppError('UNAUTHORIZED','Token inválido',401)) } }
