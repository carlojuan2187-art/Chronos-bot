const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const app = express()

// ESTE ES EL NUMERO QUE SERA EL BOT 24/7 - CON EL 1 DE MEXICO ES COMO WHATSAPP LO TIENE GUARDADO
const TU_NUMERO_BOT = "522295191113"
const ADMINS = ["5359494299"]
let currentCode = "Iniciando CHRONOS... espera 10 segundos"
let estado = "Iniciando..."

const NOMBRE = "CHRONOS"
const REGLAS = `⏳ *CHRONOS - REGLAS OFICIALES* ⏳\n\n1️⃣ Prohibido spam, links, canales\n2️⃣ Prohibido prometer ganancia asegurada\n3️⃣ Solo ADMINS mandan señales\n4️⃣ Respeta la gestión\n\nRomper reglas = expulsión.\n\nComandos: /reglas /riesgo /horario`
const BIENVENIDA = `⏳ *Bienvenido a CHRONOS* ⏳\n\nEntraste donde el tiempo se convierte en dinero.\nLee /reglas y respeta a todos.`
const RIESGO = `⏳ *GESTIÓN CHRONOS* ⏳\n\n• 1-2% por operación MAX\n• Max 3 operaciones por día\n• Si pierdes 2 seguidas, paras.`
const HORARIO = `⏳ *HORARIO CHRONOS* ⏳\n\nSeñales: 9AM - 5PM EST (NY)\nLunes a Viernes`

const REGEX_LINK = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|chat\.whatsapp\.com\/|discord\.gg\/)/i

async function startBot() {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState('sesion')
    const sock = makeWASocket({ version, auth: state, browser: ["Chronos","Chrome","1.0"] })
    sock.ev.on('creds.update', saveCreds)

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                console.log("Pidiendo codigo para:", TU_NUMERO_BOT)
                const code = await sock.requestPairingCode(TU_NUMERO_BOT)
                currentCode = code
                estado = `CODIGO PARA ${TU_NUMERO_BOT}`
                console.log(`\n========================\nCODIGO: ${code}\n========================\n`)
            } catch (e) {
                console.log("Error:", e)
                currentCode = "Error 428 - Espera 10 min sin tocar nada"
            }
        }, 10000)
    }

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect } = u
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) {
            startBot()
        }
        if (connection === 'open') {
            estado = "✅ CHRONOS CONECTADO 24/7"
            currentCode = "CONECTADO"
            console.log("✅ CONECTADO")
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return
        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase()
        const jid = msg.key.remoteJid
        const esGrupo = jid.endsWith('@g.us')
        const participant = msg.key.participant || ""

        if (texto === "/reglas") return await sock.sendMessage(jid, { text: REGLAS })
        if (texto === "/riesgo") return await sock.sendMessage(jid, { text: RIESGO })
        if (texto === "/horario") return await sock.sendMessage(jid, { text: HORARIO })
        if (texto === "/ayuda") return await sock.sendMessage(jid, { text: REGLAS })

        if (esGrupo) {
            const esAdmin = ADMINS.some(a => participant.includes(a))
            if (!esAdmin && REGEX_LINK.test(texto)) {
                try {
                    await sock.sendMessage(jid, { delete: msg.key })
                    await sock.sendMessage(jid, { text: `⏳ @${participant.split('@')[0]} - Links prohibidos en ${NOMBRE}`, mentions: [participant] })
                } catch (e) {}
            }
        }
    })

    sock.ev.on('group-participants.update', async (u) => {
        if (u.action === 'add') {
            for (let user of u.participants) {
                try {
                    await sock.sendMessage(u.id, { text: `${BIENVENIDA}\n\n@${user.split('@')[0]}`, mentions: [user] })
                } catch (e) {}
            }
        }
    })
}

startBot()

app.get('/', (req, res) => {
    res.send(`<html><body style="background:#000;color:#fff;text-align:center;font-family:Arial;margin-top:60px"><h1>${estado}</h1><h1 style="font-size:60px;color:#00ff88;letter-spacing:8px">${currentCode}</h1><p>Bot: ${TU_NUMERO_BOT} | Admin: ${ADMINS[0]}</p><p>Ve a WhatsApp > Dispositivos vinculados > Vincular con numero de telefono<br>Y escribe el codigo de arriba</p></body></html>`)
})

app.listen(process.env.PORT || 3000, () => console.log("Web CHRONOS lista"))
