const fs = require('fs/promises')
const path = require('path')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
} = require('@whiskeysockets/baileys')
const express = require('express')

const app = express()

const TU_NUMERO_BOT = String(process.env.WHATSAPP_NUMBER || '522295191113').replace(/\D/g, '')
const ADMINS = String(process.env.ADMINS || '5359494299')
    .split(',')
    .map((n) => n.replace(/\D/g, '').trim())
    .filter(Boolean)

const SESSION_DIR = path.resolve(process.env.SESSION_DIR || 'sesion')
const PORT = Number(process.env.PORT || 3000)

let currentCode = 'Iniciando CHRONOS...'
let estado = 'Iniciando...'
let activeSocket = null
let reconnectTimer = null

const NOMBRE = 'CHRONOS'
const REGLAS = `⏳ *CHRONOS - REGLAS OFICIALES* ⏳\n\n1️⃣ Prohibido spam, links, canales\n2️⃣ Prohibido prometer ganancia asegurada\n3️⃣ Solo ADMINS mandan señales\n4️⃣ Respeta la gestión\n\nRomper reglas = expulsión.\n\nComandos: /reglas /riesgo /horario`
const BIENVENIDA = `⏳ *Bienvenido a CHRONOS* ⏳\n\nEntraste donde el tiempo se convierte en dinero.\nLee /reglas y respeta a todos.`
const RIESGO = `⏳ *GESTIÓN CHRONOS* ⏳\n\n• 1-2% por operación MAX\n• Max 3 operaciones por día\n• Si pierdes 2 seguidas, paras.`
const HORARIO = `⏳ *HORARIO CHRONOS* ⏳\n\nSeñales: 9AM - 5PM EST (NY)\nLunes a Viernes`

const REGEX_LINK = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|chat\.whatsapp\.com\/|discord\.gg\/)/i

function validateConfig() {
    if (!/^\d{8,15}$/.test(TU_NUMERO_BOT)) {
        throw new Error('WHATSAPP_NUMBER debe estar en formato E.164 sin +, espacios ni guiones.')
    }
}

function getDisconnectCode(lastDisconnect) {
    return (
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.statusCode ||
        lastDisconnect?.error?.data?.statusCode ||
        null
    )
}

function scheduleReconnect(delayMs = 3000) {
    if (reconnectTimer) return

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        startBot().catch((error) => {
            console.error('Error reiniciando CHRONOS:', error)
            estado = '❌ Error reiniciando conexión'
            scheduleReconnect(5000)
        })
    }, delayMs)
}

async function clearInvalidSession() {
    try {
        await fs.rm(SESSION_DIR, { recursive: true, force: true })
        console.log('Sesión inválida eliminada. Se solicitará un nuevo código.')
    } catch (error) {
        console.error('No se pudo limpiar la sesión inválida:', error)
    }
}

async function startBot() {
    validateConfig()

    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`Baileys/WA version: ${version.join('.')} | latest=${isLatest}`)

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
    let pairingRequested = false

    const sock = makeWASocket({
        version,
        auth: state,
        // IMPORTANTE: usar un navegador canónico. Los labels personalizados pueden
        // producir códigos que se muestran pero WhatsApp rechaza al vincular.
        browser: Browsers.macOS('Desktop'),
        printQRInTerminal: false,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
    })

    activeSocket = sock
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        if (activeSocket !== sock) return

        const { connection, lastDisconnect, qr } = update

        // El pairing code se pide cuando el socket YA está intentando conectar,
        // no mediante un timer arbitrario que puede dispararse sobre un socket cerrado.
        if (
            !state.creds.registered &&
            !pairingRequested &&
            (connection === 'connecting' || Boolean(qr))
        ) {
            pairingRequested = true
            estado = `Generando código para ${TU_NUMERO_BOT}...`

            try {
                console.log('Pidiendo código para:', TU_NUMERO_BOT)
                const code = await sock.requestPairingCode(TU_NUMERO_BOT)
                currentCode = code
                estado = `CÓDIGO PARA ${TU_NUMERO_BOT}`
                console.log(`\n========================\nCÓDIGO: ${code}\n========================\n`)
            } catch (error) {
                pairingRequested = false
                const statusCode = error?.output?.statusCode || error?.statusCode || 'sin código'
                console.error('Error solicitando pairing code:', statusCode, error?.message || error)
                currentCode = `Error de pairing (${statusCode})`
                estado = '❌ WhatsApp rechazó la solicitud de vinculación'
            }
        }

        if (connection === 'open') {
            estado = '✅ CHRONOS CONECTADO 24/7'
            currentCode = 'CONECTADO'
            console.log('✅ CHRONOS conectado a WhatsApp')
            return
        }

        if (connection === 'close') {
            const statusCode = getDisconnectCode(lastDisconnect)
            const message = lastDisconnect?.error?.message || 'sin mensaje'

            console.error(`WhatsApp cerró la conexión. status=${statusCode ?? 'N/A'} message=${message}`)

            if (statusCode === DisconnectReason.loggedOut) {
                estado = '⚠️ Sesión cerrada. Generando nueva vinculación...'
                currentCode = 'NUEVO CÓDIGO EN BREVE'
                await clearInvalidSession()
            } else {
                estado = `Reconectando... (${statusCode ?? 'sin código'})`
            }

            scheduleReconnect()
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg?.message || msg.key.fromMe) return

        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase()
        const jid = msg.key.remoteJid
        if (!jid) return

        const esGrupo = jid.endsWith('@g.us')
        const participant = msg.key.participant || ''

        if (texto === '/reglas') return sock.sendMessage(jid, { text: REGLAS })
        if (texto === '/riesgo') return sock.sendMessage(jid, { text: RIESGO })
        if (texto === '/horario') return sock.sendMessage(jid, { text: HORARIO })
        if (texto === '/ayuda') return sock.sendMessage(jid, { text: REGLAS })

        if (esGrupo) {
            const esAdmin = ADMINS.some((admin) => participant.includes(admin))
            if (!esAdmin && REGEX_LINK.test(texto)) {
                try {
                    await sock.sendMessage(jid, { delete: msg.key })
                    await sock.sendMessage(jid, {
                        text: `⏳ @${participant.split('@')[0]} - Links prohibidos en ${NOMBRE}`,
                        mentions: [participant],
                    })
                } catch (error) {
                    console.error('No se pudo moderar el mensaje:', error?.message || error)
                }
            }
        }
    })

    sock.ev.on('group-participants.update', async (update) => {
        if (update.action !== 'add') return

        for (const user of update.participants) {
            try {
                await sock.sendMessage(update.id, {
                    text: `${BIENVENIDA}\n\n@${user.split('@')[0]}`,
                    mentions: [user],
                })
            } catch (error) {
                console.error('No se pudo enviar bienvenida:', error?.message || error)
            }
        }
    })
}

startBot().catch((error) => {
    console.error('Error fatal iniciando CHRONOS:', error)
    estado = '❌ Error iniciando CHRONOS'
    currentCode = error?.message || 'Revisa los logs'
    scheduleReconnect(5000)
})

app.get('/', (_req, res) => {
    res.send(`<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>CHRONOS</title>
</head>
<body style="background:#000;color:#fff;text-align:center;font-family:Arial,sans-serif;margin:60px 16px 0">
    <h1>${estado}</h1>
    <h1 style="font-size:clamp(30px,10vw,60px);color:#00ff88;letter-spacing:8px;word-break:break-word">${currentCode}</h1>
    <p>Bot: ${TU_NUMERO_BOT}</p>
    <p>WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono.</p>
    <p>Escribe el código mostrado arriba.</p>
</body>
</html>`)
})

app.get('/health', (_req, res) => {
    res.json({ ok: true, estado })
})

app.listen(PORT, () => console.log(`Web CHRONOS lista en puerto ${PORT}`))
