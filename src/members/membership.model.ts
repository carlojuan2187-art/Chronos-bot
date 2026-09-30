import mongoose from 'mongoose'
const schema=new mongoose.Schema({memberId:{type:mongoose.Schema.Types.ObjectId,ref:'Member',required:true,index:true},groupId:{type:mongoose.Schema.Types.ObjectId,ref:'Group',required:true,index:true},status:{type:String,enum:['ACTIVE','LEFT','REMOVED','BANNED'],default:'ACTIVE',index:true},joinedAt:Date,leftAt:Date,lastSeenAt:Date},{versionKey:false})
schema.index({memberId:1,groupId:1},{unique:true})
export const GroupMembership=mongoose.model('GroupMembership',schema)
