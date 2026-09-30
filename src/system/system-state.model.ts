import mongoose from 'mongoose'
const schema=new mongoose.Schema({_id:{type:String,default:'singleton'},whatsappStatus:String,lastConnectedAt:Date,lastDisconnectedAt:Date,lastFullSyncAt:Date,schedulerStatus:String,schedulerLastHeartbeat:Date,currentVersion:String,updatedAt:{type:Date,default:Date.now}},{versionKey:false})
export const SystemState=mongoose.model('SystemState',schema)
