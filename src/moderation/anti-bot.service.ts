type HistoryEntry={at:number;fingerprint:string}
const history=new Map<string,HistoryEntry[]>()

function normalizeText(text:string){return text.toLowerCase().replace(/\s+/g,' ').trim()}
function fingerprint(text:string){return normalizeText(text).replace(/\d+/g,'#').slice(0,260)}

export type BotDetection={score:number;reason:string;signals:string[]}

export function detectUnauthorizedBot(key:string,text:string,cfg:any):BotDetection|null{
  if(!cfg?.enabled)return null
  const value=normalizeText(text)
  if(!value)return null

  const threshold=Math.max(2,Number(cfg.scoreThreshold||4))
  const signals:string[]=[]
  let score=0

  if(cfg.detectModerationWarnings!==false&&/advertencia\s*\d+\s*\/\s*\d+/i.test(value)){
    score+=4;signals.push('WARNING_COUNTER')
  }
  if(cfg.detectAutomationLanguage!==false&&/(?:mensaje|enlace|link|publicaci[oó]n).{0,90}(?:eliminad|borrad|prohibid|no (?:est[aá]|esta) permitid)/i.test(value)){
    score+=2;signals.push('AUTO_MODERATION_TEXT')
  }
  if(cfg.detectAutomationLanguage!==false&&/(?:usuario|miembro|participante).{0,90}(?:expulsad|banead|bloquead|sancionad)/i.test(value)){
    score+=2;signals.push('AUTO_SANCTION_TEXT')
  }
  if(cfg.detectAutomationLanguage!==false&&/(?:bot|moderaci[oó]n|sistema).{0,70}(?:autom[aá]tic|advertencia|protecci[oó]n)/i.test(value)){
    score+=2;signals.push('BOT_LANGUAGE')
  }

  const custom=Array.isArray(cfg.customSignatures)?cfg.customSignatures:[]
  for(const raw of custom){
    const sig=normalizeText(String(raw||''))
    if(sig&&value.includes(sig)){score=Math.max(score,threshold);signals.push('CUSTOM_SIGNATURE');break}
  }

  const now=Date.now(),windowMs=Math.max(30,Number(cfg.repeatWindowSeconds||600))*1000
  const fp=fingerprint(value)
  const entries=(history.get(key)||[]).filter(e=>now-e.at<=windowMs)
  entries.push({at:now,fingerprint:fp});history.set(key,entries)
  const repeats=entries.filter(e=>e.fingerprint===fp).length
  if(repeats>=Math.max(2,Number(cfg.repeatThreshold||2))){score+=2;signals.push('REPEATED_TEMPLATE')}

  if(score<threshold)return null
  return{score,signals,reason:`Comportamiento automatizado no autorizado (${signals.join(', ')})`}
}

export function resetAntiBotHistory(){history.clear()}
