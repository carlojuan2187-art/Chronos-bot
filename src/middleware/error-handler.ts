import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../errors/app-error.js'
import { logger } from '../utils/logger.js'
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ success:false, error:{ code:'VALIDATION_ERROR', message:'Datos inválidos', details:err.flatten() } })
  if (err instanceof AppError) return res.status(err.status).json({ success:false, error:{ code:err.code, message:err.message, details:err.details } })
  logger.error({ err }, 'Unhandled error')
  return res.status(500).json({ success:false, error:{ code:'INTERNAL_ERROR', message:'Error interno del servidor' } })
}
