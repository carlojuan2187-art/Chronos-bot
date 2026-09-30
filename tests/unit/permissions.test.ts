import { describe,it,expect } from 'vitest'
import { hasPermission } from '../../src/config/permissions.js'
describe('permissions',()=>{it('owner can global ban',()=>expect(hasPermission('OWNER','members.globalBan')).toBe(true));it('moderator cannot global ban',()=>expect(hasPermission('MODERATOR','members.globalBan')).toBe(false));it('admin can manage groups',()=>expect(hasPermission('ADMIN','groups.manage')).toBe(true))})
