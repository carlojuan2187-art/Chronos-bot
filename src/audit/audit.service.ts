import { AuditLog } from './audit.model.js'
export async function audit(entry:any){ try { await AuditLog.create(entry) } catch {} }
