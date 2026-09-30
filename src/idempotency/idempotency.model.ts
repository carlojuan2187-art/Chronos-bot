import mongoose from 'mongoose'
const schema=new mongoose.Schema({key:{type:String,unique:true,required:true},adminId:String,operation:String,response:mongoose.Schema.Types.Mixed,createdAt:{type:Date,default:Date.now},expiresAt:{type:Date,index:true,required:true}},{versionKey:false})
schema.index({expiresAt:1},{expireAfterSeconds:0})
export const IdempotencyKey=mongoose.model('IdempotencyKey',schema)
