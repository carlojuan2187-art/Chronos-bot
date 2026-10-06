import { expect,it } from 'vitest'
import { errorSummary } from '../../src/utils/error-summary.js'
it('keeps the real WhatsApp code visible in text-only log exports',()=>{
  expect(errorSummary({message:'rate-over-limit',data:429,output:{statusCode:500}})).toBe('code=429 message=rate-over-limit')
  expect(errorSummary({message:'forbidden',output:{statusCode:403},request:{token:'secret'}})).toBe('code=403 message=forbidden')
})
it('bounds and flattens exported error text',()=>{
  const result=errorSummary(new Error('first\nsecond\t'+'x'.repeat(1000)))
  expect(result).not.toMatch(/[\n\t]/)
  expect(result.length).toBeLessThan(300)
})
