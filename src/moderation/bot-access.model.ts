import mongoose from 'mongoose'

const schema=new mongoose.Schema({
  name:{type:String,required:true,trim:true},
  phoneNumberNormalized:{type:String,default:'',index:true},
  userJid:{type:String,default:'',index:true},
  alternateJids:{type:[String],default:[]},
  access:{type:String,enum:['ALLOW','BLOCK'],required:true,default:'ALLOW',index:true},
  scope:{type:String,enum:['GROUP','COMMUNITY','GLOBAL'],required:true,index:true},
  groupId:{type:mongoose.Schema.Types.ObjectId,ref:'Group',default:null,index:true},
  communityId:{type:mongoose.Schema.Types.ObjectId,ref:'Community',default:null,index:true},
  bypass:{
    antiBot:{type:Boolean,default:true},
    antiLink:{type:Boolean,default:true},
    antiSpam:{type:Boolean,default:true},
    blockedContent:{type:Boolean,default:false},
  },
  status:{type:String,enum:['ACTIVE','SUSPENDED'],default:'ACTIVE',index:true},
  notes:{type:String,default:''},
  createdBy:String,
  createdAt:{type:Date,default:Date.now},
  updatedAt:{type:Date,default:Date.now},
  lastMatchedAt:Date,
},{versionKey:false,minimize:false})

schema.index({status:1,scope:1,access:1})
schema.index({phoneNumberNormalized:1,status:1})

export const BotAccessRule=mongoose.model('BotAccessRule',schema)
