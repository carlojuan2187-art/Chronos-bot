import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDatabase,disconnectDatabase } from './config/database.js'
import { startWhatsApp,stopWhatsApp } from './whatsapp/whatsapp.client.js'
import { syncGroups } from './whatsapp/whatsapp.sync.js'
import { startScheduler,stopScheduler } from './scheduler/scheduler.service.js'
import { logger } from './utils/logger.js'
import { startGroupScheduleWorker,stopGroupScheduleWorker } from './scheduler/group-schedule.service.js'

async function main(){await connectDatabase();const app=createApp();const server=app.listen(env.PORT,()=>logger.info({port:env.PORT},'CHRONOS backend listening'));await startWhatsApp();setTimeout(()=>syncGroups().catch(e=>logger.warn({err:e},'Initial group sync failed')),8000);setInterval(()=>syncGroups().catch(e=>logger.warn({err:e},'Periodic group sync failed')),env.GROUP_SYNC_INTERVAL_MINUTES*60000).unref();startScheduler(env.SCHEDULER_POLL_SECONDS);startGroupScheduleWorker();const shutdown=async(signal:string)=>{logger.info({signal},'Shutting down');stopScheduler();stopGroupScheduleWorker();await stopWhatsApp();server.close(async()=>{await disconnectDatabase();process.exit(0)})};process.on('SIGTERM',()=>void shutdown('SIGTERM'));process.on('SIGINT',()=>void shutdown('SIGINT'))}
main().catch(e=>{logger.fatal({err:e},'CHRONOS failed to start');process.exit(1)})
