import { SignJWT, jwtVerify } from 'jose'
import { env, type AdminRole } from '../config/env.js'
const secret = new TextEncoder().encode(env.JWT_SECRET)
export async function signAccessToken(adminId:string, role:AdminRole) { return new SignJWT({ role, tokenType:'access' }).setProtectedHeader({alg:'HS256'}).setSubject(adminId).setIssuedAt().setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`).sign(secret) }
export async function signPreAuthToken(adminId:string, role:AdminRole) { return new SignJWT({ role, tokenType:'2fa_setup' }).setProtectedHeader({alg:'HS256'}).setSubject(adminId).setIssuedAt().setExpirationTime('10m').sign(secret) }
export async function verifyAccessToken(token:string) { return jwtVerify(token, secret) }
