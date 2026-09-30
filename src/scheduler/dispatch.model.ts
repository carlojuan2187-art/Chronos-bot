import mongoose from 'mongoose'
const schema=new mongoose.Schema({sourceType:{type:String,enum:['ANNOUNCEMENT','SCHEDULED'],required:true},sourceId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},occurrenceId:{type:String,required:true},groupId:{type:mongoose.Schema.Types.ObjectId,ref:'Group',required:true,index:true},status:{type:String,enum:['PENDING','SENT','FAILED','SKIPPED','CANCELLED'],default:'PENDING'},attempts:{type:Number,default:0},errorCode:String,errorMessage:String,sentAt:Date,createdAt:{type:Date,default:Date.now},updatedAt:{type:Date,default:Date.now}},{versionKey:false})
schema.index({sourceId:1,occurrenceId:1,groupId:1},{unique:true})
export const MessageDispatch=mongoose.model('MessageDispatch',schema)
