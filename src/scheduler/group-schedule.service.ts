import { DateTime } from 'luxon'
import { Group } from '../groups/group.model.js'
import { getWhatsAppSocket } from '../whatsapp/whatsapp.client.js'
import { logger } from '../utils/logger.js'

let timer: NodeJS.Timeout | null = null
let running = false
let rateLimitUntil = 0
let rateLimitBackoffMs = 5 * 60_000
const MIN_RATE_LIMIT_BACKOFF_MS = 5 * 60_000
const MAX_RATE_LIMIT_BACKOFF_MS = 30 * 60_000
const GROUP_ACTION_DELAY_MS = 1_500

function desiredMode(schedule: any) {
  if (schedule?.manualOverride === 'OPEN') return 'OPEN'
  if (schedule?.manualOverride === 'CLOSED') return 'CLOSED'
  if (schedule?.mode === 'OPEN') return 'OPEN'
  if (schedule?.mode === 'ADMINS_ONLY') return 'CLOSED'
  if (schedule?.mode !== 'SCHEDULED') return 'OPEN'
  const now = DateTime.now().setZone(schedule.timezone || 'UTC')
  if (Array.isArray(schedule.days) && !schedule.days.includes(now.weekday)) return 'CLOSED'
  const hm = now.toFormat('HH:mm')
  return hm >= String(schedule.openTime || '00:00') && hm < String(schedule.closeTime || '23:59') ? 'OPEN' : 'CLOSED'
}

function isRateLimitError(error: any) {
  const message = String(error?.message || '').toLowerCase()
  return error?.data === 429 || error?.statusCode === 429 || message.includes('rate-overlimit') || message.includes('rate limit')
}

function shouldManageSchedule(schedule: any) {
  const mode = schedule?.mode || 'OPEN'
  const manual = schedule?.manualOverride
  if (manual === 'OPEN' || manual === 'CLOSED') return true
  if (mode === 'SCHEDULED' || mode === 'ADMINS_ONLY') return true
  // If CHRONOS previously closed a managed group, allow it to restore OPEN.
  return schedule?.lastAppliedMode === 'CLOSED'
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function tick() {
  if (running) return
  if (Date.now() < rateLimitUntil) return

  const sock = getWhatsAppSocket()
  if (!sock) return

  running = true
  try {
    const groups = await Group.find({ status: { $in: ['ACTIVE', 'NOT_ADMIN'] } })
    let hadSuccessfulAction = false

    for (const g of groups) {
      const s: any = (g as any).schedule || {}
      if (!shouldManageSchedule(s)) continue

      const want = desiredMode(s)
      if (s.lastAppliedMode === want) continue
      if (!g.botIsAdmin) continue

      try {
        await sock.groupSettingUpdate(g.groupJid, want === 'OPEN' ? 'not_announcement' : 'announcement')
        await Group.updateOne(
          { _id: g._id },
          { $set: { 'schedule.lastAppliedMode': want, updatedAt: new Date() } },
        )
        const msg = want === 'OPEN' ? s.openMessage : s.closeMessage
        if (msg) await sock.sendMessage(g.groupJid, { text: String(msg) })
        hadSuccessfulAction = true
        await sleep(GROUP_ACTION_DELAY_MS)
      } catch (error: any) {
        if (isRateLimitError(error)) {
          rateLimitUntil = Date.now() + rateLimitBackoffMs
          logger.warn(
            { err: error, groupJid: g.groupJid, retryAfterMs: rateLimitBackoffMs },
            'Group schedule rate-limited; pausing schedule actions',
          )
          rateLimitBackoffMs = Math.min(rateLimitBackoffMs * 2, MAX_RATE_LIMIT_BACKOFF_MS)
          break
        }
        logger.warn({ err: error, groupJid: g.groupJid }, 'Could not apply group schedule')
      }
    }

    if (hadSuccessfulAction && Date.now() >= rateLimitUntil) {
      rateLimitBackoffMs = MIN_RATE_LIMIT_BACKOFF_MS
    }
  } finally {
    running = false
  }
}

export function startGroupScheduleWorker() {
  if (timer) return
  timer = setInterval(() => tick().catch(error => logger.error({ err: error }, 'Group schedule tick failed')), 30_000)
  void tick()
}

export function stopGroupScheduleWorker() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export async function forceGroupMode(groupId: string, mode: 'OPEN' | 'CLOSED' | null) {
  const g = await Group.findById(groupId)
  if (!g) throw new Error('GROUP_NOT_FOUND')
  const schedule: any = (g as any).schedule || {}
  schedule.manualOverride = mode
  schedule.lastAppliedMode = null
  ;(g as any).schedule = schedule
  g.markModified('schedule')
  await g.save()
  await tick()
  return g
}
