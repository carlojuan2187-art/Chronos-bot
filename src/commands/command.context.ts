import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
export type CommandContext={sock:WASocket;msg:WAMessage;jid:string;participant:string;text:string;args:string[];actor:{username:string;phone:string;role:'OWNER'|'ADMIN'|'MODERATOR'}|null}
