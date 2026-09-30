import mongoose from 'mongoose'
const schema=new mongoose.Schema({memberId:{type:mongoose.Schema.Types.ObjectId,ref:'Member',required:true,index:true},scope:{type:String,enum:['GROUP','COMMUNITY','GLOBAL'],required:true,index:true},groupId:{type:mongoose.Schema.Types.ObjectId,ref:'Group',default:null,index:true},communityId:{type:mongoose.Schema.Types.ObjectId,ref:'Community',default:null,index:true},reason:String,issuedBy:String,status:{type:String,enum:['ACTIVE','REVOKED'],default:'ACTIVE',index:true},createdAt:{type:Date,default:Date.now},revokedAt:Date},{versionKey:false})
schema.index({memberId:1,scope:1,groupId:1,communityId:1,status:1})
export const Ban=mongoose.model('Ban',schema)
