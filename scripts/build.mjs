import { createHash } from 'node:crypto'
import { readdirSync,readFileSync,rmSync,writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve,relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const root=fileURLToPath(new URL('../',import.meta.url))
const files=[]
function walk(directory){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const path=resolve(directory,entry.name)
    if(entry.isDirectory())walk(path)
    else if(entry.isFile())files.push(path)
  }
}
walk(resolve(root,'src'))
files.push(resolve(root,'package.json'),resolve(root,'pairing-engine.cjs'),fileURLToPath(import.meta.url))
const hash=createHash('sha256')
for(const file of files.sort())hash.update(relative(root,file)).update('\0').update(readFileSync(file)).update('\0')
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'))
rmSync(resolve(root,'dist'),{recursive:true,force:true})
const compile=spawnSync(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'-p',resolve(root,'tsconfig.json')],{cwd:root,stdio:'inherit'})
if(compile.error)throw compile.error
if(compile.status!==0)process.exit(compile.status||1)
const info={version:pkg.version,build:hash.digest('hex').slice(0,16)}
writeFileSync(resolve(root,'dist/build-info.json'),JSON.stringify(info)+'\n')
console.log(`CHRONOS build version=${info.version} build=${info.build}`)
