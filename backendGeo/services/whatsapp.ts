import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

let sock: WASocket | null = null;
let qrCodeDataUrl: string | null = null;
let connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
let lastError: string | null = null;
let isInitializing = false;
let qrTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

// Use process.cwd() so the path is always relative to the project root
const authFolder = path.join(process.cwd(), 'baileys_auth');

function clearQrTimeout() {
  if (qrTimeoutHandle) {
    clearTimeout(qrTimeoutHandle);
    qrTimeoutHandle = null;
  }
}

export async function initWhatsApp() {
  if (isInitializing || connectionStatus === 'CONNECTED') {
    console.log(`[Baileys] initWhatsApp skipped. isInitializing=${isInitializing}, status=${connectionStatus}`);
    return;
  }
  isInitializing = true;
  connectionStatus = 'CONNECTING';
  lastError = null;
  qrCodeDataUrl = null;

  console.log(`[Baileys] Iniciando conexión. authFolder=${authFolder}`);

  // Safety timeout: if no QR is emitted within 45s, reset so user can retry
  clearQrTimeout();
  qrTimeoutHandle = setTimeout(() => {
    if (connectionStatus === 'CONNECTING' && !qrCodeDataUrl) {
      console.warn('[Baileys] Timeout: No se recibió QR en 45s. Reiniciando estado...');
      lastError = 'Timeout al generar QR. Intenta nuevamente.';
      connectionStatus = 'DISCONNECTED';
      isInitializing = false;
      if (sock) {
        try { sock.end(undefined); } catch (_) {}
        sock = null;
      }
    }
  }, 45000);

  try {
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
      console.log(`[Baileys] Auth folder creado: ${authFolder}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    console.log('[Baileys] Auth state cargado correctamente.');

    // Fetch the latest WhatsApp Web version to prevent 405 handshake rejection
    console.log('[Baileys] Obteniendo versión de WhatsApp Web más reciente...');
    let waVersion: any = [2, 3000, 1017531287]; // Fallback seguro
    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      waVersion = version;
      console.log(`[Baileys] Usando WhatsApp Web v${version.join('.')}, isLatest: ${isLatest}`);
    } catch (verErr: any) {
      console.warn('[Baileys] Error obteniendo versión web actual, usando fallback:', verErr?.message);
    }

    const minimalLogger = {
      level: 'warn',
      child: () => minimalLogger,
      trace: () => {},
      debug: () => {},
      info:  () => {},
      warn:  (...args: any[]) => console.warn('[Baileys:warn]', ...args),
      error: (...args: any[]) => console.error('[Baileys:error]', ...args),
      fatal: (...args: any[]) => console.error('[Baileys:fatal]', ...args),
    };

    sock = makeWASocket({
      version: waVersion,
      auth: state,
      printQRInTerminal: false,
      logger: minimalLogger as any,
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 30000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      console.log(`[Baileys] connection.update → connection=${connection}, hasQR=${!!qr}`);

      if (qr) {
        clearQrTimeout(); // QR received — cancel timeout
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr);
          console.log('[Baileys] QR generado e imagen dataURL creada.');
        } catch (qrErr) {
          console.error('[Baileys QR Error]', qrErr);
          lastError = 'Error al generar imagen QR.';
        }
      }

      if (connection === 'close') {
        clearQrTimeout();
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isInvalidSession = statusCode === 405;

        console.log(`[Baileys] Conexión cerrada. StatusCode=${statusCode} loggedOut=${isLoggedOut} invalidSession=${isInvalidSession}`);

        connectionStatus = 'DISCONNECTED';
        qrCodeDataUrl = null;
        sock = null;
        isInitializing = false;

        if (isLoggedOut || isInvalidSession) {
          if (fs.existsSync(authFolder)) {
            try {
              fs.rmSync(authFolder, { recursive: true, force: true });
              console.log('[Baileys] Auth folder eliminado.');
            } catch (rmErr) {
              console.error('[Baileys] Error eliminando auth folder:', rmErr);
            }
          }
          lastError = `Sesión inválida (${statusCode}). Por favor presiona "Conectar" para escanear un nuevo QR.`;
        } else {
          console.log('[Baileys] Reconectando en 6 segundos...');
          setTimeout(() => { initWhatsApp(); }, 6000);
        }
      } else if (connection === 'open') {
        clearQrTimeout();
        console.log('[Baileys] ✅ WhatsApp conectado exitosamente.');
        connectionStatus = 'CONNECTED';
        qrCodeDataUrl = null;
        lastError = null;
        isInitializing = false;
      }
    });
  } catch (err: any) {
    clearQrTimeout();
    console.error('[Baileys Init Error]', err);
    lastError = err?.message || 'Error desconocido al iniciar WhatsApp.';
    connectionStatus = 'DISCONNECTED';
    isInitializing = false;
  }
}

export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    hasQR: !!qrCodeDataUrl,
    error: lastError,
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
  clearQrTimeout();
  if (sock) {
    try { await sock.logout(); } catch (_e) {}
    sock = null;
  }
  connectionStatus = 'DISCONNECTED';
  qrCodeDataUrl = null;
  lastError = null;
  isInitializing = false;
  if (fs.existsSync(authFolder)) {
    fs.rmSync(authFolder, { recursive: true, force: true });
  }
  console.log('[Baileys] Desconectado y credenciales eliminadas.');
}
