import mongoose from 'mongoose'
const schema=new mongoose.Schema({
  _id:{type:String,default:'singleton'},
  enabled:{type:Boolean,default:true},
  sourceJids:{type:[String],default:[]},
  publicAlertEnabled:{type:Boolean,default:true},
  scanExistingGroups:{type:Boolean,default:true},
  actionDelayMs:{type:Number,default:900,min:250,max:10000},
  updatedBy:String,
  updatedAt:{type:Date,default:Date.now}
},{versionKey:false,minimize:false})
export const ScamGuardConfig=mongoose.model('ScamGuardConfig',schema)
