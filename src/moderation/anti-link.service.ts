const http=/(https?:\/\/|www\.)/i
// Dominios escritos sin protocolo ni www, por ejemplo: ejemplo.com o ejemplo.com/ruta.
// Se exige un TLD alfabético (o punycode) para no confundir decimales/IPs con enlaces.
// El límite izquierdo evita tratar direcciones de correo como enlaces desnudos.
const bareDomain=/(?:^|[\s([{"'=:>])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})(?=$|[\s)\]}"',!?;:\/])/i
const wa=/(wa\.me\/|chat\.whatsapp\.com\/)/i
const tg=/(t\.me\/|telegram\.me\/|telegram:\s*@)/i
const phone=/(?:^|\s)\+?\d[\d\s().-]{8,}\d(?:\s|$)/
const obfuscated=/(?:https?\s*[: ]\s*\/\s*\/|(?:www|t|wa)\s*(?:\.|punto|dot)\s*(?:me|com)|chat\s*(?:\.|punto)\s*whatsapp)/i

export function detectsBlockedLink(text:string,cfg:any){
  if(!cfg||cfg.enabled===false)return false

  // Compatibility with groups created before detectBareDomains existed:
  // if the field is missing, it follows detectHttpLinks, preserving v2.0.13 behavior.
  const detectHttpLinks=cfg?.detectHttpLinks!==false
  const detectBareDomains=cfg?.detectBareDomains ?? detectHttpLinks
  const detectWhatsAppLinks=cfg?.detectWhatsAppLinks!==false
  const detectTelegramLinks=cfg?.detectTelegramLinks!==false
  const detectPhoneNumbers=cfg?.detectPhoneNumbers!==false
  const detectObfuscatedLinks=cfg?.detectObfuscatedLinks!==false

  return Boolean(
    (detectHttpLinks&&http.test(text))||
    (detectBareDomains&&bareDomain.test(text))||
    (detectWhatsAppLinks&&wa.test(text))||
    (detectTelegramLinks&&tg.test(text))||
    (detectPhoneNumbers&&phone.test(text))||
    (detectObfuscatedLinks&&obfuscated.test(text))
  )
}
