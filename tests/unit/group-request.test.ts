import { afterEach,describe,expect,it,vi } from 'vitest'
import { groupRequest,groupRequestBlocked,isGroupRateLimit } from '../../src/whatsapp/group-request.service.js'

afterEach(()=>vi.useRealTimers())
describe('WhatsApp group request budget',()=>{
  it('recognizes the exact Boom error shape from the screenshot',()=>{
    expect(isGroupRateLimit({message:'rate-over-limit',data:429,output:{statusCode:500}})).toBe(true)
    expect(isGroupRateLimit({statusCode:403})).toBe(false)
  })
  it('serializes operations and spaces them',async()=>{
    vi.useFakeTimers()
    const sock={} as any,order:string[]=[]
    const first=groupRequest(sock,async()=>{order.push('first');return 1})
    const second=groupRequest(sock,async()=>{order.push('second');return 2})
    await first
    expect(order).toEqual(['first'])
    await vi.advanceTimersByTimeAsync(900)
    expect(await second).toBe(2)
    expect(order).toEqual(['first','second'])
  })
  it('shares cooldown between callers and retries only after it expires',async()=>{
    vi.useFakeTimers()
    const sock={} as any,operation=vi.fn().mockResolvedValue('ok')
    await expect(groupRequest(sock,async()=>{throw {message:'rate-over-limit',data:429}})).rejects.toMatchObject({data:429})
    expect(groupRequestBlocked(sock)).toBe(true)
    await expect(groupRequest(sock,operation)).rejects.toMatchObject({statusCode:429})
    expect(operation).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await groupRequest(sock,operation)).toBe('ok')
  })
})
