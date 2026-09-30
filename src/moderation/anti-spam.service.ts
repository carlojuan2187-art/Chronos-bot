type Entry={at:number;text:string;isMedia:boolean;mentions:number}
const history=new Map<string,Entry[]>()
export function detectSpam(key:string,text:string,isMedia:boolean,mentions:number,cfg:any){ if(!cfg?.enabled||cfg.mode==='OFF')return null; const now=Date.now(); const arr=(history.get(key)||[]).filter(e=>now-e.at<60000); arr.push({at:now,text:text.trim().toLowerCase(),isMedia,mentions});history.set(key,arr)
  const dup=arr.filter(e=>now-e.at<=cfg.duplicateWindowSeconds*1000&&e.text&&e.text===text.trim().toLowerCase()).length; if(dup>=cfg.duplicateThreshold)return 'DUPLICATE'
  const burst=arr.filter(e=>now-e.at<=cfg.burstWindowSeconds*1000).length; if(burst>=cfg.burstThreshold)return 'BURST'
  const media=arr.filter(e=>now-e.at<=cfg.mediaWindowSeconds*1000&&e.isMedia).length; if(media>=cfg.mediaThreshold)return 'MEDIA_FLOOD'
  if(mentions>=cfg.mentionThreshold)return 'MENTION_FLOOD'; return null }
