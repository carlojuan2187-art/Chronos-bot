import { AppError } from '../errors/app-error.js'
export function buildWhatsAppContent(content:any, media?:any){
  const text=String(content?.text||'')
  if(!media?.url) return {text}
  let u:URL; try{u=new URL(String(media.url))}catch{throw new AppError('VALIDATION_ERROR','URL de media inválida',400)}
  if(u.protocol!=='https:') throw new AppError('VALIDATION_ERROR','La media debe usar HTTPS',400)
  if(media.type==='IMAGE') return {image:{url:u.toString()},caption:text}
  if(media.type==='VIDEO') return {video:{url:u.toString()},caption:text}
  if(media.type==='DOCUMENT') return {document:{url:u.toString()},fileName:String(media.fileName||'documento'),mimetype:String(media.mimeType||'application/octet-stream'),caption:text}
  throw new AppError('VALIDATION_ERROR','Tipo de media no soportado',400)
}
