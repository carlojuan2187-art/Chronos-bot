import mongoose from 'mongoose'
const schema=new mongoose.Schema({messageId:{type:String,unique:true,required:true},groupJid:String,processedAt:{type:Date,default:Date.now}},{versionKey:false})
schema.index({processedAt:1},{expireAfterSeconds:259200})
export const ProcessedMessage=mongoose.model('ProcessedMessage',schema)
