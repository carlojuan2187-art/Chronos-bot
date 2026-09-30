import fs from 'node:fs/promises'
import path from 'node:path'
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, fetchLatestWaWebVersion, useMultiFileAuthState, type WASocket } from '@whiskeysockets/baileys'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { whatsappPublicState } from './state.js'
import { registerWhatsAppEvents } from './whatsapp.events.js'
import { SystemState } from '../system/system-state.model.js'

let activeSocket: WASocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let stopping=false
export function getWhatsAppSocket(){ return activeSocket }
export function requireWhatsAppSocket(){ if(!activeSocket) throw new Error('WHATSAPP_DISCONNECTED'); return activeSocket }
async function exists(p:string){try{await fs.access(p);return true}catch{return false}}
async function clearSession(){await fs.rm(path.resolve(env.SESSION_DIR),{recursive:true,force:true})}
function disconnectCode(ld:any){return ld?.error?.output?.statusCode||ld?.error?.statusCode||ld?.error?.data?.statusCode||null}
function scheduleReconnect(ms=4000){if(stopping||reconnectTimer)return; reconnectTimer=setTimeout(()=>{reconnectTimer=null;startWhatsApp().catch(e=>{logger.error({err:e},'WhatsApp restart failed');scheduleReconnect(5000)})},ms)}

export async function startWhatsApp(){
  if(!env.WHATSAPP_ENABLED){whatsappPublicState.status='DISABLED';whatsappPublicState.number=env.WHATSAPP_NUMBER;return}
  stopping=false; whatsappPublicState.number=env.WHATSAPP_NUMBER
  let info=typeof fetchLatestWaWebVersion==='function'?await fetchLatestWaWebVersion():undefined
  if(!info?.isLatest) info=await fetchLatestBaileysVersion()
  const sessionDir=path.resolve(env.SESSION_DIR); const had=await exists(path.join(sessionDir,'creds.json')); let bundle=await useMultiFileAuthState(sessionDir)
  if(had&&!bundle.state.creds.registered){logger.warn('Partial WhatsApp session found; clearing it');await clearSession();bundle=await useMultiFileAuthState(sessionDir)}
  const {state,saveCreds}=bundle; let pairingRequested=false
  const sock=makeWASocket({version:info.version,auth:state,browser:Browsers.macOS('Chrome'),printQRInTerminal:false,connectTimeoutMs:60000,defaultQueryTimeoutMs:60000,markOnlineOnConnect:false,syncFullHistory:false})
  activeSocket=sock; sock.ev.on('creds.update',saveCreds); registerWhatsAppEvents(sock)
  sock.ev.on('connection.update',async(update:any)=>{
    if(activeSocket!==sock)return
    const {connection,lastDisconnect,qr}=update
    if(!state.creds.registered&&!pairingRequested&&Boolean(qr)){
      pairingRequested=true;whatsappPublicState.status='PAIRING'
      try{const code=await sock.requestPairingCode(env.WHATSAPP_NUMBER);whatsappPublicState.pairingCode=code;logger.info({pairingCode:code},'WhatsApp pairing code generated')}catch(e:any){pairingRequested=false;logger.error({err:e},'Pairing code failed')}
    }
    if(connection==='open'){whatsappPublicState.status='CONNECTED';whatsappPublicState.pairingCode=null;await SystemState.findByIdAndUpdate('singleton',{$set:{whatsappStatus:'CONNECTED',lastConnectedAt:new Date(),updatedAt:new Date()}},{upsert:true});logger.info('CHRONOS connected to WhatsApp');return}
    if(connection==='close'){
      activeSocket=null;const code=disconnectCode(lastDisconnect);const unregistered=!state.creds.registered;await SystemState.findByIdAndUpdate('singleton',{$set:{whatsappStatus:'DISCONNECTED',lastDisconnectedAt:new Date(),updatedAt:new Date()}},{upsert:true})
      logger.warn({statusCode:code,message:lastDisconnect?.error?.message},'WhatsApp connection closed')
      if(code===429){whatsappPublicState.status='RATE_LIMITED';return}
      if(code===DisconnectReason.loggedOut||(unregistered&&[405,408,428].includes(code))){await clearSession();whatsappPublicState.status='PAIRING'}else whatsappPublicState.status='RECONNECTING'
      scheduleReconnect()
    }
  })
}
export async function stopWhatsApp(){stopping=true;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}try{activeSocket?.end(undefined)}catch{}activeSocket=null;whatsappPublicState.status='DISCONNECTED'}
export async function reconnectWhatsApp(){await stopWhatsApp();stopping=false;await startWhatsApp()}
