const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const express = require('express')
const app = express()

const NOMBRE = "CHRONOS"
const ADMINS = ["5359494299"] // TU PERSONAL - ERES EL JEFE DE CHRONOS
const TU_NUMERO_BOT = "522295191113" // EL NUMERO QUE SERA EL BOT 24/7
let currentCode = "Generando codigo... espera 5 segundos"

const REGLAS = `⏳ *CHRONOS - REGLAS OFICIALES* ⏳

1️⃣ Prohibido spam, links, canales o "escríbeme al privado"
2️⃣ Prohibido prometer ganancia asegurada
3️⃣ Solo ADMINS mandan señales.

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

const REGEX_LINK = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|chat\.whatsapp\.com\/|discord\.gg\/|instagram\.com\/|https?:\/\/.*\..*)/i
const PALABRAS_SPAM = ["escribeme al privado", "escribeme al pv", "ganancia asegurada", "vip gratis", "unete a mi grupo", "escribeme al whatsapp"]

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sesion')
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Chronos Bot", "Chrome", "1.0"]
    })

    sock.ev.on('creds.update', saveCreds)

    if (!sock.authState.creds.registered) {
        const pedirCodigo = async () => {
            try {
                const code = await sock.requestPairingCode(TU_NUMERO_BOT)
                currentCode = code
                console.log(`\n\n========================\n⏳ CODIGO CHRONOS: ${code}\nNUMERO BOT: ${TU_NUMERO_BOT}\nEste codigo dura 60s, luego genero otro\n========================\n\n`)
            } catch (e) {
                console.log("Error pidiendo codigo", e)
            }
        }
        setTimeout(pedirCodigo, 5000)
        setInterval(pedirCodigo, 60000)
    }

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect } = u
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) {
            startBot()
        }
        if (connection === 'open') {
            console.log(`✅ CHRONOS ONLINE - BOT: ${TU_NUMERO_BOT}`)
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").toLowerCase()
        const jid = msg.key.remoteJid
        const esGrupo = jid.endsWith('@g.us')
        const participant = msg.key.participant || ""

        if (texto === "/reglas") {
            return sock.sendMessage(jid, { text: REGLAS })
        }
        if (texto === "/ayuda") {
            return sock.sendMessage(jid, { text: `⏳ *CHRONOS BOT - COMANDOS* ⏳\n\n${REGLAS}` })
        }
        if (texto === "/riesgo") {
            return sock.sendMessage(jid, { text: `⏳ *GESTIÓN CHRONOS* ⏳\n\n• 1-2% por operación MAX\n• Max 3 operaciones por día\n• Si pierdes 2 seguidas, paras.\n• El que no respeta gestión, lo saca el mercado.` })
        }
        if (texto === "/horario") {
            return sock.sendMessage(jid, { text: `⏳ *HORARIO CHRONOS* ⏳\n\nSeñales: 9AM - 5PM EST (NY)\nSesión más rentable: NY y Londres.` })
        }

        if (esGrupo) {
            const esAdmin = ADMINS.some(a => participant.includes(a))
            const tieneLink = REGEX_LINK.test(texto)
            const tieneSpam = PALABRAS_SPAM.some(p => texto.includes(p))

            if (!esAdmin && (tieneLink || tieneSpam)) {
                try {
                    await sock.sendMessage(jid, { delete: msg.key })
                    await sock.sendMessage(jid, { text: `⏳ @${participant.split('@')[0]} - Links y spam prohibidos en *${NOMBRE}*. Solo admins pueden mandar señales.`, mentions: [participant] })
                } catch (e) {
                    console.log("No pude borrar, no soy admin del grupo")
                }
            }
        }
    })

    sock.ev.on('group-participants.update', async (u) => {
        if (u.action === 'add') {
            for (let user of u.participants) {
                try {
