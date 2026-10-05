import { describe,it,expect } from 'vitest'
import { hasPermission } from '../../src/config/permissions.js'
describe('permissions',()=>{
  it('owner can global ban',()=>expect(hasPermission('OWNER','members.globalBan')).toBe(true))
  it('moderator cannot global ban',()=>expect(hasPermission('MODERATOR','members.globalBan')).toBe(false))
  it('admin can manage groups',()=>expect(hasPermission('ADMIN','groups.manage')).toBe(true))
  it('owner can configure and revoke Scam Guard',()=>{expect(hasPermission('OWNER','scamGuard.configure')).toBe(true);expect(hasPermission('OWNER','scamGuard.revoke')).toBe(true)})
  it('admin can report but cannot revoke Scam Guard',()=>{expect(hasPermission('ADMIN','scamGuard.manage')).toBe(true);expect(hasPermission('ADMIN','scamGuard.revoke')).toBe(false)})
  it('moderator cannot access Scam Guard',()=>expect(hasPermission('MODERATOR','scamGuard.read')).toBe(false))
})
