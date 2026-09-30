import type { RequestHandler } from 'express'
import type { ZodTypeAny } from 'zod'
export const validate = (schema: ZodTypeAny, source: 'body'|'query'|'params'='body'): RequestHandler => (req,_res,next) => { (req as any)[source] = schema.parse((req as any)[source]); next() }
