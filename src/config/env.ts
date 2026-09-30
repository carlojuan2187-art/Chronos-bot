import 'dotenv/config'
import { z } from 'zod'

export type AdminRole = 'OWNER' | 'ADMIN' | 'MODERATOR'
export type PanelUser = { username: string; phone: string; role: AdminRole; passwordHash: string }

const boolFromEnv = z.preprocess((v) => {
  if (typeof v !== 'string') return v
  return !['false','0','no','off'].includes(v.toLowerCase())
}, z.boolean())

const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  WHATSAPP_NUMBER: z.string().regex(/^\d{8,15}$/),
  SESSION_DIR: z.string().min(1).default('sesion'),
  CHRONOS_PANEL_USERS: z.string().default('[]'),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ADMIN_SECURITY_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  CORS_ORIGINS: z.string().default(''),
  PAIRING_PAGE_TOKEN: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
  WHATSAPP_ENABLED: boolFromEnv.default(true),
  GROUP_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  SCHEDULER_POLL_SECONDS: z.coerce.number().int().positive().default(15),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
}

let panelUsers: PanelUser[]
try {
  const raw = JSON.parse(parsed.data.CHRONOS_PANEL_USERS)
  panelUsers = z.array(z.object({
    username: z.string().min(1),
    phone: z.string().regex(/^\d{8,15}$/),
    role: z.enum(['OWNER','ADMIN','MODERATOR']),
    passwordHash: z.string().min(10),
  })).parse(raw)
} catch (error) {
  throw new Error(`CHRONOS_PANEL_USERS is invalid JSON/config: ${error instanceof Error ? error.message : String(error)}`)
}

if (panelUsers.filter(u => u.role === 'OWNER').length !== 1) {
  throw new Error('CHRONOS_PANEL_USERS must contain exactly one OWNER')
}

const usernames = new Set<string>()
const phones = new Set<string>()
for (const user of panelUsers) {
  if (usernames.has(user.username.toLowerCase())) throw new Error(`Duplicate admin username: ${user.username}`)
  if (phones.has(user.phone)) throw new Error(`Duplicate admin phone: ${user.phone}`)
  usernames.add(user.username.toLowerCase()); phones.add(user.phone)
}

export const env = {
  ...parsed.data,
  panelUsers,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map(v => v.trim()).filter(Boolean),
}
