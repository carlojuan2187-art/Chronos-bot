import { normalizePhone } from '../utils/jid.js'

/** Exact country-specific equivalents, never suffix/partial matching or LIDs. */
export function scamPhoneAliases(value:string):string[]{
  if(value.includes('@'))return []
  const phone=normalizePhone(value)
  if(!/^\d{8,15}$/.test(phone))return []
  if(/^521\d{10}$/.test(phone))return [phone,`52${phone.slice(3)}`]
  if(/^52\d{10}$/.test(phone))return [phone,`521${phone.slice(2)}`]
  return [phone]
}
export function sameScamPhone(first:string,second:string){
  const aliases=scamPhoneAliases(first)
  return scamPhoneAliases(second).some(phone=>aliases.includes(phone))
}
