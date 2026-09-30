import crypto from 'node:crypto'
import { env } from '../config/env.js'
const key = Buffer.from(env.ADMIN_SECURITY_ENCRYPTION_KEY, 'hex')
export function sha256(value: string) { return crypto.createHash('sha256').update(value).digest('hex') }
export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('hex') }
export function encryptText(value: string) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value,'utf8'), cipher.final()]); const tag = cipher.getAuthTag()
  return [iv,tag,encrypted].map(b=>b.toString('base64url')).join('.')
}
export function decryptText(value: string) {
  const [ivS,tagS,dataS] = value.split('.'); if (!ivS || !tagS || !dataS) throw new Error('Invalid encrypted value')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivS,'base64url')); decipher.setAuthTag(Buffer.from(tagS,'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(dataS,'base64url')), decipher.final()]).toString('utf8')
}
