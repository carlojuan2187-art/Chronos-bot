import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { onWhatsAppConnected, startWhatsApp, stopWhatsApp } from './whatsapp/whatsapp.client.js'
import { syncGroups } from './whatsapp/whatsapp.sync.js'
import { startScheduler, stopScheduler } from './scheduler/scheduler.service.js'
import { logger } from './utils/logger.js'
import { startGroupScheduleWorker, stopGroupScheduleWorker } from './scheduler/group-schedule.service.js'

async function main() {
  const app = createApp()
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'CHRONOS backend listening'))

  let databaseConnected = false
  let runtimeStarted = false
  let groupSyncTimer: NodeJS.Timeout | null = null

  const startOperationalRuntime = async () => {
    if (!databaseConnected) {
      await connectDatabase()
      databaseConnected = true
    }
    if (!runtimeStarted) {
      runtimeStarted = true
      startScheduler(env.SCHEDULER_POLL_SECONDS)
      startGroupScheduleWorker()
      groupSyncTimer = setInterval(() => syncGroups().catch((error) => logger.warn({ err: error }, 'Periodic group sync failed')), env.GROUP_SYNC_INTERVAL_MINUTES * 60_000)
      groupSyncTimer.unref()
    }
    await syncGroups().catch((error) => logger.warn({ err: error }, 'Initial/reconnect group sync failed'))
  }

  // The control panel must remain available even when WhatsApp is not yet paired.
  // Connect MongoDB independently before starting the WhatsApp pairing lifecycle.
  if (!databaseConnected) {
    await connectDatabase()
    databaseConnected = true
  }

  onWhatsAppConnected(() => void startOperationalRuntime())
  await startWhatsApp()

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down')
    stopScheduler()
    stopGroupScheduleWorker()
    if (groupSyncTimer) clearInterval(groupSyncTimer)
    await stopWhatsApp()
    server.close(async () => {
      if (databaseConnected) await disconnectDatabase()
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  logger.fatal({ err: error }, 'CHRONOS failed to start')
  process.exit(1)
})
