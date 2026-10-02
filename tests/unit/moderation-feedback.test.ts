import { describe, expect, it, vi } from 'vitest'
import { sendAntiBotRemovalFeedback, sendAntiLinkFirstWarning, sendAntiLinkRemovalFeedback } from '../../src/moderation/moderation-feedback.service.js'

function socketMock() {
  const sendMessage = vi.fn().mockResolvedValue({})
  return { socket: { sendMessage } as any, sendMessage }
}

describe('CHRONOS moderation feedback', () => {
  it('warns first, then sends the sticker on first anti-link infringement', async () => {
    const { socket, sendMessage } = socketMock()
    await sendAntiLinkFirstWarning(socket, 'group@g.us', 'Usuario', 'user@s.whatsapp.net')
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls[0]?.[1]).toMatchObject({
      text: '⚠️ Usuario, ese contenido no está permitido.\n\nEsta vez fue el mensaje.\nA la próxima...',
      mentions: ['user@s.whatsapp.net'],
    })
    expect(sendMessage.mock.calls[1]?.[1]).toHaveProperty('sticker')
  })

  it('sends sticker first and Te lo dije after an anti-link removal', async () => {
    const { socket, sendMessage } = socketMock()
    await sendAntiLinkRemovalFeedback(socket, 'group@g.us')
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls[0]?.[1]).toHaveProperty('sticker')
    expect(sendMessage.mock.calls[1]?.[1]).toEqual({ text: 'Te lo dije. 👋' })
  })

  it('sends the anti-bot house message and sticker', async () => {
    const { socket, sendMessage } = socketMock()
    await sendAntiBotRemovalFeedback(socket, 'group@g.us')
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls[0]?.[1]).toEqual({
      text: '🤖 CHRONOS — Bot no autorizado detectado\n\nAcceso eliminado.\n\nAquí ya hay quien cuide la casa. 👋',
    })
    expect(sendMessage.mock.calls[1]?.[1]).toHaveProperty('sticker')
  })
})
