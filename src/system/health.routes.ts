import { buildInfo } from './build-info.js'
import { Router } from 'express'
import mongoose from 'mongoose'
import { whatsappPublicState } from '../whatsapp/state.js'
export const healthRouter=Router();healthRouter.get('/health',(_req,res)=>res.json({status:'ok',...buildInfo,database:mongoose.connection.readyState===1?'connected':'disconnected',whatsapp:whatsappPublicState.status}))
