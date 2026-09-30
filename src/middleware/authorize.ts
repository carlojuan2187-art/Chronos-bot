import type { RequestHandler } from 'express'
import { hasPermission, type Permission } from '../config/permissions.js'
import { AppError } from '../errors/app-error.js'
export const authorize=(permission:Permission):RequestHandler=>(req,_res,next)=>{ if(!req.admin||!hasPermission(req.admin.role,permission)) return next(new AppError('FORBIDDEN','No tienes permiso para esta acción',403)); next() }
