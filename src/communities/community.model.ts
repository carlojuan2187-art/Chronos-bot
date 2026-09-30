import mongoose from 'mongoose'
const schema=new mongoose.Schema({whatsappCommunityJid:{type:String,index:true,sparse:true,unique:true},name:{type:String,required:true},description:String,status:{type:String,enum:['ACTIVE','ARCHIVED'],default:'ACTIVE'},createdAt:{type:Date,default:Date.now},updatedAt:{type:Date,default:Date.now},lastSyncAt:Date},{versionKey:false})
export const Community=mongoose.model('Community',schema)
