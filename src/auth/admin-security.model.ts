import mongoose from 'mongoose'
const schema = new mongoose.Schema({ adminId:{type:String,unique:true,required:true}, totpEnabled:{type:Boolean,default:false}, totpSecretEncrypted:String, recoveryCodesHashes:[String], enrolledAt:Date, updatedAt:{type:Date,default:Date.now} }, { versionKey:false })
export const AdminSecurity = mongoose.model('AdminSecurity', schema)
