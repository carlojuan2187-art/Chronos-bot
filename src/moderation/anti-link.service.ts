const http=/(https?:\/\/|www\.)/i, wa=/(wa\.me\/|chat\.whatsapp\.com\/)/i, tg=/(t\.me\/|telegram\.me\/|telegram:\s*@)/i
const phone=/(?:^|\s)\+?\d[\d\s().-]{8,}\d(?:\s|$)/
const obfuscated=/(?:https?\s*[: ]\s*\/\s*\/|(?:www|t|wa)\s*(?:\.|punto|dot)\s*(?:me|com)|chat\s*(?:\.|punto)\s*whatsapp)/i
export function detectsBlockedLink(text:string,cfg:any){ if(!cfg?.enabled)return false; return Boolean((cfg.detectHttpLinks&&http.test(text))||(cfg.detectWhatsAppLinks&&wa.test(text))||(cfg.detectTelegramLinks&&tg.test(text))||(cfg.detectPhoneNumbers&&phone.test(text))||(cfg.detectObfuscatedLinks&&obfuscated.test(text))) }
