import rateLimit from 'express-rate-limit'
export const apiRateLimit = rateLimit({ windowMs: 60_000, limit: 240, standardHeaders:'draft-7', legacyHeaders:false })
export const loginRateLimit = rateLimit({ windowMs: 15*60_000, limit: 10, standardHeaders:'draft-7', legacyHeaders:false })
