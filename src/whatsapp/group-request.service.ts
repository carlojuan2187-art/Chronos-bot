import type { WASocket } from '@whiskeysockets/baileys'

export function isGroupRateLimit(error:any):boolean {
  return [error?.data?.statusCode,error?.data,error?.status,error?.statusCode,error?.output?.statusCode].some(value=>Number(value)===429)
    || /rate.over.limit|\b429\b/i.test(String(error?.message||''))
}

type RequestState={tail:Promise<void>;nextAt:number;blockedUntil:number;failures:number}
const states=new WeakMap<WASocket,RequestState>()
function stateFor(sock:WASocket){
  let state=states.get(sock)
  if(!state){state={tail:Promise.resolve(),nextAt:0,blockedUntil:0,failures:0};states.set(sock,state)}
  return state
}
export function groupRequestBlocked(sock:WASocket){return stateFor(sock).blockedUntil>Date.now()}

// Only group discovery, scheduling and Scam Guard use this queue. Message
// deletion and the existing moderation pipeline retain their current behavior.
export function groupRequest<T>(sock:WASocket,operation:()=>Promise<T>,spacingMs=900):Promise<T>{
  const state=stateFor(sock)
  const run=state.tail.then(async()=>{
    const assertAvailable=()=>{
      if(sock.ws?.isOpen===false)throw new Error('WHATSAPP_NOT_CONNECTED')
      if(groupRequestBlocked(sock))throw Object.assign(new Error('WHATSAPP_GROUP_RATE_LIMIT_COOLDOWN'),{statusCode:429,retryAt:state.blockedUntil})
    }
    assertAvailable()
    const delay=state.nextAt-Date.now()
    if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay))
    assertAvailable()
    try{
      const result=await operation()
      state.failures=0
      return result
    }catch(error){
      if(isGroupRateLimit(error)){
        state.failures++
        state.blockedUntil=Date.now()+Math.min(300_000,60_000*2**(state.failures-1))
      }
      throw error
    }finally{state.nextAt=Date.now()+Math.max(250,spacingMs)}
  })
  state.tail=run.then(()=>{},()=>{})
  return run
}
