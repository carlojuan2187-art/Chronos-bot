// Keep operational error details in the message as well as structured fields:
// Railway text exports can omit the latter. Never serialize full payloads.
export function errorSummary(error:any):string {
  const code=error?.data?.statusCode??(typeof error?.data==='number'?error.data:undefined)??error?.statusCode??error?.output?.statusCode??error?.code??'UNKNOWN'
  const message=String(error?.message||'Unknown error').replace(/[\r\n\t]/g,' ').slice(0,240)
  return `code=${String(code).slice(0,40)} message=${message}`
}
