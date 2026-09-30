import mongoose from 'mongoose'
const schema = new mongoose.Schema({ adminId:{type:String,index:true,required:true}, refreshTokenHash:{type:String,unique:true,required:true}, ipAddress:String, userAgent:String, createdAt:{type:Date,default:Date.now}, lastUsedAt:Date, expiresAt:{type:Date,index:true,required:true}, revokedAt:Date }, { versionKey:false })
schema.index({ expiresAt:1 }, { expireAfterSeconds:0 })
export const AdminSession = mongoose.model('AdminSession', schema)
