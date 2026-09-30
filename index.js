const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')

const NOMBRE = "CHRONOS"
const ADMINS = ["5359494299"]
const TU_NUMERO_BOT = "522295191113"

const REGLAS = `⏳ *CHRONOS - REGLAS OFICIALES* ⏳

1️⃣ Prohibido spam, links, canales o "escribeme al privado"
2️⃣ Prohibido prometer ganancia asegurada
3️⃣ Solo ADMINS mandan señales.`

const BIENVENIDA = `⏳ *Bienvenido a CHRONOS* ⏳

Donde el tiempo se convierte en dinero.
Lee /reglas y respeta la gestion.

Bienvenido a la familia.`

const REGEX_LINK = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|chat\.whatsapp\.com\/|discord\.gg\/)/i
const SPAM = ["escribeme al privado", "ganancia asegurada", "vip gratis", "unete a mi grupo"]

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sesion')
    const sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: ["Chronos Bot", "Chrome", "1.0"] })
    sock.ev.on('creds.update', saveCreds)

    if(!sock.authState.creds.registered){
        setTimeout(async () => {
            const code = await sock.requestPairingCode(TU_NUMERO_BOT)
            console.log(`\n\n⏳ TU CODIGO CHRONOS ES: ${code}\n\n`)
        }, 5000)
    }

    sock.ev.on('connection.update', (u) => {
        if(u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) startBot()
        if(u.connection === 'open') console.log(`✅ CHRONOS ONLINE`)
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if(!msg.message || msg.key.fromMe) return
        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase()
        const jid = msg.key.remoteJid
        const participant = msg.key.participant || ""
        const esGrupo = jid.endsWith('@g.us')

        if(texto === "/reglas") return sock.sendMessage(jid, { text: REGLAS })
        if(texto === "/riesgo") return sock.sendMessage(jid, { text: "⏳ Gestion: 1-2% por operacion MAX" })
        if(texto === "/horario") return sock.sendMessage(jid, { text: "⏳ Horario: 9AM - 5PM EST" })

        if(esGrupo){
            const esAdmin = ADMINS.some(a => participant.includes(a))
            if(!esAdmin && (REGEX_LINK.test(texto) || SPAM.some(p => texto.includes(p)))){
                await sock.sendMessage(jid, { delete: msg.key })
                await sock.sendMessage(jid, { text: `⏳ @${participant.split('@')[0]} Links prohibidos. Solo admins.`, mentions: [participant] })
            }
        }
    })

    sock.ev.on('group-participants.update', async (u) => {
        if(u.action === 'add'){
            for(let user of u.participants){
                await sock.sendMessage(u.id, { text: `${BIENVENIDA} @${user.split('@')[0]}`, mentions: [user] })
            }
        }
    })
}
startBot()
