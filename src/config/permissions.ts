import type { AdminRole } from './env.js'

export type Permission =
  | 'groups.read' | 'groups.manage' | 'members.read' | 'members.warn' | 'members.kick'
  | 'members.groupBan' | 'members.communityBan' | 'members.globalBan'
  | 'announcements.manage' | 'schedules.manage' | 'audit.read' | 'whatsapp.manage'
  | 'whitelist.manage'

const permissions: Record<AdminRole, Set<Permission>> = {
  OWNER: new Set(['groups.read','groups.manage','members.read','members.warn','members.kick','members.groupBan','members.communityBan','members.globalBan','announcements.manage','schedules.manage','audit.read','whatsapp.manage','whitelist.manage']),
  ADMIN: new Set(['groups.read','groups.manage','members.read','members.warn','members.kick','members.groupBan','members.communityBan','announcements.manage','schedules.manage','audit.read','whitelist.manage']),
  MODERATOR: new Set(['groups.read','members.read','members.warn','members.kick','members.groupBan','audit.read']),
}

export function hasPermission(role: AdminRole, permission: Permission) {
  return permissions[role].has(permission)
}

export function rolePermissions(role: AdminRole) {
  return [...permissions[role]]
}
