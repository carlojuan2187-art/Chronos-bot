const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const app = express()

const NOMBRE = "CHRONOS"
const ADMINS = ["5359494299"] // TU PERSONAL - JEFE
const TU_NUMERO_BOT = "522295191113" // BOT 24/7
let currentCode = "Iniciando... espera 10 segundos"

const REGLAS = `⏳ *CHRONOS - REGLAS OFICIALES* ⏳

1️⃣ Prohibido spam, links, canales o "escríbeme al privado"
2️⃣ Prohibido prometer ganancia asegurada
3️⃣ Solo ADMINS mandan señales.
4️⃣ Respeta la gestión de riesgo

Romper reglas = expulsión directa.

Comandos: /reglas /riesgo /horario /ayuda`

const BIENVENIDA = `⏳ *Bienvenido a CHRONOS* ⏳

Entraste al lugar donde el tiempo se convierte en dinero.

Aquí no vendemos humo. Operamos con disciplina, gestión y paciencia.

📌 Lee /reglas
📌 Respeta a todos
📌 Enfócate en aprender

El mercado recompensa a los pacientes.

Bienvenido a la familia.`

const RIESGO = `⏳ *GESTIÓN CHRONOS* ⏳

• 1-2% por operación MAX
• Max 3 operaciones por día
• Si pierdes 2 seguidas, paras el día.
• El que no respeta gestión, lo saca el mercado.`

const HORARIO = `⏳ *HORARIO CHRONOS* ⏳

Señales: 9AM - 5PM EST (NY)
Sesión más rentable: NY y Londres.
Lunes a Viernes.`

const REGEX_LINK = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|chat\.whatsapp\.com\/|discord\.gg\/|instagram\.com\/)/i
const PALABRAS_SPAM = ["escribeme al privado", "escribeme al pv", "ganancia asegurada", "vip gratis", "unete a mi grupo", "escribeme al whatsapp"]

async function startBot() {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState('sesion')

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Chronos Bot", "Chrome", "1.0"]
    })

    sock.ev.on('creds.update', saveCreds)

    // CORRECCION 428: Esperar 10s y pedir solo UNA vez
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                console.log("Pidiendo codigo para:", TU_NUMERO_BOT)
                const code = await sock.requestPairingCode(TU_NUMERO_BOT)
                currentCode = code
                console.log(`\n========================\n⏳ CODIGO CHRONOS: ${code}\n========================\n`)
            } catch (e) {
                console.log("Error codigo:", e)
                currentCode = "Error 428 - Espera 10 min sin borrar nada y se arregla solo"
            }
        }, 10000)
    }

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect } = u
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) {
            startBot()
        }
        if (connection === 'open') {
            console.log(`✅ CHRONOS ONLINE - BOT: ${TU_NUMERO_BOT}`)
            currentCode = "✅ CONECTADO"
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").toLowerCase()
        const jid = msg.key.remoteJid
        const esGrupo = jid.endsWith('@g.us')
        const participant = msg.key.participant || ""

        if (texto === "/reglas") return sock.sendMessage(jid, { text: REGLAS })
        if (texto === "/ayuda") return sock.sendMessage(jid, { text: `⏳ *CHRONOS BOT - COMANDOS* ⏳\n\n${REGLAS}` })
        if (texto === "/riesgo") return sock.sendMessage(jid, { text: RIESGO })
        if (texto === "/horario") return sock.sendMessage(jid, { text: HORARIO })

        if (esGrupo) {
            const esAdmin = ADMINS.some(a => participant.includes(a))
            const tieneLink = REGEX_LINK.test(texto)
            const tieneSpam = PALABRAS_SPAM.some(p => texto.includes(p))

            if (!esAdmin && (tieneLink || tieneSpam)) {
                try {
                    await sock.sendMessage(jid, { delete: msg.key })
                    await sock.sendMessage(jid, { text: `⏳ @${participant.split('@')[0]} - Links y spam prohibidos en *${NOMBRE}*. Solo admins.`, mentions: [participant] })
                } catch (e) {
                    console.log("No soy admin, no pude borrar")
                }
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
    res.send(`
        <html><body style="font-family:Arial; text-align:center; background:#000; color:#fff; margin-top:50px;">
        <h1>⏳ CHRONOS BOT 24/7</h1>
        <h2 style="font-size:50px; color:#00ff88; letter-spacing:5px;">${currentCode}</h2>
        <p>Bot: ${TU_NUMERO_BOT} | Admin: ${ADMINS[0]}</p>
        <p>Si ves un codigo de 8 letras, metelo rapido en WhatsApp > Dispositivos vinculados > Vincular con numero</p>
        </body></html>
    `)
})
app.listen(process.env.PORT || 3000, () => console.log("Web abierta"))
