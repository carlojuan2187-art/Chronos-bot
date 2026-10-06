import { readFileSync } from 'node:fs'

export function readBuildInfo(){
  try{
    const info=JSON.parse(readFileSync(new URL('../build-info.json',import.meta.url),'utf8'))
    return {version:String(info.version),build:String(info.build)}
  }catch{
    // tsx development does not have compiled build metadata. Production must
    // run npm run build, which writes the fingerprint alongside dist/server.js.
    if(process.env.NODE_ENV==='production')throw new Error('BUILD_INFO_MISSING: run npm run build')
    const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'))
    return {version:String(pkg.version),build:'development-unverified'}
  }
}
export const buildInfo=readBuildInfo()
