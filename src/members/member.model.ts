import mongoose from 'mongoose'
const schema=new mongoose.Schema({userJid:{type:String,unique:true,index:true,required:true},phoneNumberNormalized:{type:String,index:true},displayName:String,status:{type:String,default:'ACTIVE'},moderationSummary:{type:mongoose.Schema.Types.Mixed,default:{}},firstSeenAt:{type:Date,default:Date.now},lastSeenAt:{type:Date,default:Date.now},createdAt:{type:Date,default:Date.now},updatedAt:{type:Date,default:Date.now}},{versionKey:false})
export const Member=mongoose.model('Member',schema)
