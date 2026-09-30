import crypto from 'node:crypto'
import type { RequestHandler } from 'express'
export const requestId: RequestHandler = (req,res,next) => { const id = req.header('x-request-id') || crypto.randomUUID(); (req as any).requestId=id; res.setHeader('x-request-id',id); next() }
