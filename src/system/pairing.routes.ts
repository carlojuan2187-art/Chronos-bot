import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request } from 'express'
import QRCode from 'qrcode'
import { env } from '../config/env.js'
import { whatsappPublicState } from '../whatsapp/state.js'
import { resetWhatsAppPairing } from '../whatsapp/whatsapp.client.js'

const COOKIE_NAME = 'chronos_pairing_access'
const COOKIE_MAX_AGE_MS = 60 * 60 * 1000

function tokenDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}
function readCookie(req: Request, name: string): string | null {
  const raw=req.headers.cookie;if(!raw)return null
  for(const pair of raw.split(';')){const i=pair.indexOf('=');if(i<0)continue;const k=pair.slice(0,i).trim();if(k===name)return decodeURIComponent(pair.slice(i+1).trim())}
  return null
}
function escapeHtml(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function page(body:string,refresh=false){return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh?'<meta http-equiv="refresh" content="4">':''}<title>CHRONOS · WhatsApp</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07090c;color:#f4f7fb;font-family:Arial,sans-serif}.wrap{max-width:620px;margin:0 auto;padding:36px 18px}.card{background:#11151b;border:1px solid #232b35;border-radius:18px;padding:24px}h1{margin:0 0 22px;font-size:25px}.muted{color:#9ba8b7}.ok{color:#58dd9a}.warn{color:#ffd36b}.qr{display:block;width:min(340px,100%);margin:20px auto;background:#fff;border-radius:14px;padding:12px}code{display:block;font-size:34px;letter-spacing:4px;font-weight:800;color:#35e58a;margin:24px 0}.btn,input{width:100%;padding:14px 16px;border-radius:12px;font-size:16px}.btn{border:0;background:#20c77a;color:#04130c;font-weight:700;cursor:pointer;margin-top:10px}input{background:#0a0d11;color:#fff;border:1px solid #34404e}</style></head><body><div class="wrap"><div class="card"><h1>CHRONOS · WhatsApp</h1>${body}</div></div></body></html>`}
function accessForm(message=''){return page(`${message?`<p class="warn"><strong>${escapeHtml(message)}</strong></p>`:''}<p class="muted">Introduce la clave privada configurada en Railway.</p><form method="get" action="/"><input name="key" type="password" required placeholder="Clave de acceso"><button class="btn" type="submit">Entrar</button></form>`)}
function isAuthorized(req:Request){if(!env.PAIRING_PAGE_TOKEN)return false;const expected=tokenDigest(env.PAIRING_PAGE_TOKEN);const cookie=readCookie(req,COOKIE_NAME);return Boolean(cookie&&safeEqual(cookie,expected))}

async function statusPage(){
  const s=whatsappPublicState.status;const number=escapeHtml(whatsappPublicState.number||'No configurado')
  if(s==='CONNECTED')return page(`<h2 class="ok">✅ WhatsApp vinculado</h2><p>Bot: ${number}</p><p class="muted">La sesión quedó registrada correctamente.</p>`)
  if(s==='PAIRING'&&whatsappPublicState.pairingCode)return page(`<h2>Vincular con número de teléfono</h2><p>Bot: ${number}</p><code>${escapeHtml(whatsappPublicState.pairingCode)}</code><p><strong>WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono</strong></p><p class="muted">Este código se genera automáticamente con el mismo flujo de la versión de CHRONOS que ya vinculaba.</p>`,true)
  if(s==='PAIRING'&&whatsappPublicState.qr){const data=await QRCode.toDataURL(whatsappPublicState.qr,{width:420,margin:2,errorCorrectionLevel:'M'});return page(`<h2>Escanea el QR</h2><p>Bot: ${number}</p><img class="qr" src="${data}" alt="QR"><p><strong>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</strong></p>`,true)}
  return page(`<h2>Estado: ${escapeHtml(s)}</h2><p>Bot: ${number}</p><p class="muted">Esperando una nueva solicitud válida de WhatsApp.</p><form method="post" action="/pairing/reset"><button class="btn" type="submit">Reiniciar vinculación desde cero</button></form>`,true)
}

export const pairingRouter=Router()
pairingRouter.get('/',async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');if(!env.PAIRING_PAGE_TOKEN)return res.status(503).type('html').send(page('<h2>Página desactivada</h2><p>Configura PAIRING_PAGE_TOKEN.</p>'));const expected=tokenDigest(env.PAIRING_PAGE_TOKEN);const supplied=typeof req.query.key==='string'?req.query.key:null;if(supplied){if(!safeEqual(tokenDigest(supplied),expected))return res.status(401).type('html').send(accessForm('Clave incorrecta.'));res.cookie(COOKIE_NAME,expected,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'strict',maxAge:COOKIE_MAX_AGE_MS,path:'/'});return res.redirect('/')}if(!isAuthorized(req))return res.status(401).type('html').send(accessForm());return res.type('html').send(await statusPage())}catch(e){return next(e)}})
pairingRouter.post('/pairing/reset',async(req,res)=>{res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');if(!isAuthorized(req))return res.status(401).type('html').send(accessForm());try{await resetWhatsAppPairing();return res.redirect('/')}catch(error:any){return res.status(500).type('html').send(page(`<h2 class="warn">No se pudo reiniciar la vinculación</h2><p>${escapeHtml(String(error?.message||error))}</p>`))}})
