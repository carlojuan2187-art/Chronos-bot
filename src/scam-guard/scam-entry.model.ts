import mongoose from 'mongoose'
const schema=new mongoose.Schema({
  phoneNumberNormalized:{type:String,required:true,unique:true,index:true},
  memberId:{type:mongoose.Schema.Types.ObjectId,ref:'Member',default:null,index:true},
  banId:{type:mongoose.Schema.Types.ObjectId,ref:'Ban',default:null},
  ownsBan:{type:Boolean,default:false},
  status:{type:String,enum:['ACTIVE','REVOKED'],default:'ACTIVE',index:true},
  reason:{type:String,default:'Reporte confirmado por administrador de CHRONOS'},
  firstReportedAt:{type:Date,default:Date.now},
  lastReportedAt:{type:Date,default:Date.now,index:true},
  firstReportedBy:String,
  lastReportedBy:String,
  sourceJid:String,
  reportCount:{type:Number,default:1},
  detectionCount:{type:Number,default:0},
  removalCount:{type:Number,default:0},
  lastDetectedAt:Date,
  lastRemovedAt:Date,
  revokedAt:Date,
  revokedBy:String,
  createdAt:{type:Date,default:Date.now},
  updatedAt:{type:Date,default:Date.now}
},{versionKey:false})
schema.index({status:1,lastReportedAt:-1})
export const ScamEntry=mongoose.model('ScamEntry',schema)
