import mongoose from 'mongoose'
const schema=new mongoose.Schema({
  entryId:{type:mongoose.Schema.Types.ObjectId,ref:'ScamEntry',required:true,index:true},
  phoneNumberNormalized:{type:String,required:true,index:true},
  reason:String,
  reportedBy:{type:String,required:true,index:true},
  reporterRole:{type:String,enum:['OWNER','ADMIN'],required:true},
  source:{type:String,enum:['WHATSAPP','PANEL'],required:true,index:true},
  sourceJid:String,
  sourceMessageId:String,
  createdAt:{type:Date,default:Date.now,index:true}
},{versionKey:false})
schema.index({sourceMessageId:1,phoneNumberNormalized:1},{unique:true,partialFilterExpression:{sourceMessageId:{$type:'string'}}})
export const ScamReport=mongoose.model('ScamReport',schema)
