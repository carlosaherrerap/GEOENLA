import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

let sock: WASocket | null = null;
let qrCodeDataUrl: string | null = null;
let connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
let isInitializing = false;

const authFolder = path.join(__dirname, '../baileys_auth');

export async function initWhatsApp() {
  if (isInitializing || connectionStatus === 'CONNECTED') {
    return;
  }
  isInitializing = true;
  connectionStatus = 'CONNECTING';

  try {
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr);
        } catch (qrErr) {
          console.error('[Baileys QR Error]', qrErr);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[Baileys Connection Closed] Status Code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        connectionStatus = 'DISCONNECTED';
        qrCodeDataUrl = null;
        sock = null;
        isInitializing = false;

        if (shouldReconnect) {
          setTimeout(() => {
            initWhatsApp();
          }, 3000);
        }
      } else if (connection === 'open') {
        console.log('[Baileys Connection Opened] WhatsApp Conectado Exitosamente.');
        connectionStatus = 'CONNECTED';
        qrCodeDataUrl = null;
        isInitializing = false;
      }
    });
  } catch (err) {
    console.error('[Baileys Init Error]', err);
    connectionStatus = 'DISCONNECTED';
    isInitializing = false;
  }
}

export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    hasQR: !!qrCodeDataUrl,
  };
}

export function getWhatsAppQR() {
  return qrCodeDataUrl;
}

export async function sendWhatsAppMessage(phoneNumber: string, message: string): Promise<boolean> {
  if (!sock || connectionStatus !== 'CONNECTED') {
    console.warn('[Baileys Send Warning] WhatsApp no está conectado.');
    return false;
  }

  try {
    // Sanitizar número peruano/internacional (ej: 987654321 -> 51987654321@s.whatsapp.net)
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.length === 9) {
      cleanNumber = `51${cleanNumber}`;
    }
    const jid = `${cleanNumber}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: message });
    console.log(`[Baileys Message Sent] A: ${jid}`);
    return true;
  } catch (err) {
    console.error(`[Baileys Send Error] Error enviando mensaje a ${phoneNumber}:`, err);
    return false;
  }
}

export async function disconnectWhatsApp() {
  if (sock) {
    try {
      await sock.logout();
    } catch (_e) {}
    sock = null;
  }
  connectionStatus = 'DISCONNECTED';
  qrCodeDataUrl = null;
  if (fs.existsSync(authFolder)) {
    fs.rmSync(authFolder, { recursive: true, force: true });
  }
}
