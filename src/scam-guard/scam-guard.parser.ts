import { normalizePhone } from '../utils/jid.js'

const PHONE_CANDIDATE=/\+?\d[\d\s().-]{6,}\d/g
const REPORT_SIGNAL=/(?:^|\b)(?:\/report(?:e)?|report(?:e|ado|ar|o)?|estafa(?:dor|dora|do|da)?|scam(?:mer)?|fraude|fraudulento|fraudulenta)(?:\b|$)/i

export type ParsedScamReport={phones:string[];reason:string}

function validPhone(phone:string){return phone.length>=8&&phone.length<=15}

export function extractReportPhones(text:string){
  const phones:string[]=[]
  for(const match of text.match(PHONE_CANDIDATE)||[]){
    const phone=normalizePhone(match)
    if(validPhone(phone)&&!phones.includes(phone))phones.push(phone)
  }
  return phones
}

function looksLikeOnlyPhone(text:string,phones:string[]){
  if(phones.length===0)return false
  let rest=text
  for(const raw of text.match(PHONE_CANDIDATE)||[])rest=rest.replace(raw,' ')
  return rest.replace(/[\s:;,./+()\-–—]+/g,'').length===0
}

export function parseScamReport(text:string):ParsedScamReport|null{
  const clean=String(text||'').trim()
  if(!clean)return null
  const phones=extractReportPhones(clean)
  if(phones.length===0)return null
  if(!REPORT_SIGNAL.test(clean)&&!looksLikeOnlyPhone(clean,phones))return null
  let reason=clean.replace(/^\s*\/report(?:e)?\b\s*/i,'').trim()
  for(const raw of clean.match(PHONE_CANDIDATE)||[])reason=reason.replace(raw,' ')
  reason=reason.replace(/\s+/g,' ').replace(/^[\s:;,.-]+|[\s:;,.-]+$/g,'').trim()
  if(!reason||/^report(?:e|ado|ar|o)?$/i.test(reason))reason='Reporte confirmado por administrador de CHRONOS'
  return{phones,reason:reason.slice(0,500)}
}

export function maskPhone(phone:string){
  const normalized=normalizePhone(phone)
  if(normalized.length<=4)return normalized
  const visible=Math.min(4,normalized.length)
  return `+${normalized.slice(0,Math.max(1,normalized.length-visible-4))}${'•'.repeat(Math.min(4,Math.max(2,normalized.length-visible)))}${normalized.slice(-visible)}`
}
