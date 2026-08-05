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

// Maps of active sockets and connection states keyed by adminId
const activeSockets = new Map<string, WASocket | null>();
const qrCodeDataUrls = new Map<string, string | null>();
const connectionStatuses = new Map<string, 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>();
const lastErrors = new Map<string, string | null>();
const isInitializingMap = new Map<string, boolean>();
const qrTimeoutHandles = new Map<string, ReturnType<typeof setTimeout> | null>();

function getAuthFolder(adminId: string): string {
  return path.join(process.cwd(), `baileys_auth/auth_admin_${adminId}`);
}

function clearQrTimeout(adminId: string) {
  const handle = qrTimeoutHandles.get(adminId);
  if (handle) {
    clearTimeout(handle);
    qrTimeoutHandles.set(adminId, null);
  }
}

export async function initWhatsApp(adminId: string) {
  const isInitializing = isInitializingMap.get(adminId) || false;
  const connectionStatus = connectionStatuses.get(adminId) || 'DISCONNECTED';

  if (isInitializing || connectionStatus === 'CONNECTED') {
    console.log(`[Baileys][${adminId}] initWhatsApp skipped. isInitializing=${isInitializing}, status=${connectionStatus}`);
    return;
  }

  isInitializingMap.set(adminId, true);
  connectionStatuses.set(adminId, 'CONNECTING');
  lastErrors.set(adminId, null);
  qrCodeDataUrls.set(adminId, null);

  const authFolder = getAuthFolder(adminId);
  console.log(`[Baileys][${adminId}] Iniciando conexión. authFolder=${authFolder}`);

  // Safety timeout: if no QR is emitted within 45s, reset so user can retry
  clearQrTimeout(adminId);
  const timeoutHandle = setTimeout(() => {
    const currentStatus = connectionStatuses.get(adminId) || 'DISCONNECTED';
    const currentQR = qrCodeDataUrls.get(adminId);
    if (currentStatus === 'CONNECTING' && !currentQR) {
      console.warn(`[Baileys][${adminId}] Timeout: No se recibió QR en 45s. Reiniciando estado...`);
      lastErrors.set(adminId, 'Timeout al generar QR. Intenta nuevamente.');
      connectionStatuses.set(adminId, 'DISCONNECTED');
      isInitializingMap.set(adminId, false);
      const sock = activeSockets.get(adminId);
      if (sock) {
        try { sock.end(undefined); } catch (_) {}
        activeSockets.set(adminId, null);
      }
    }
  }, 45000);
  qrTimeoutHandles.set(adminId, timeoutHandle);

  try {
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
      console.log(`[Baileys][${adminId}] Auth folder creado: ${authFolder}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    console.log(`[Baileys][${adminId}] Auth state cargado correctamente.`);

    // Fetch the latest WhatsApp Web version to prevent 405 handshake rejection
    console.log(`[Baileys][${adminId}] Obteniendo versión de WhatsApp Web más reciente...`);
    let waVersion: any = [2, 3000, 1017531287]; // Fallback seguro
    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      waVersion = version;
      console.log(`[Baileys][${adminId}] Usando WhatsApp Web v${version.join('.')}, isLatest: ${isLatest}`);
    } catch (verErr: any) {
      console.warn(`[Baileys][${adminId}] Error obteniendo versión web actual, usando fallback:`, verErr?.message);
    }

    const minimalLogger = {
      level: 'warn',
      child: () => minimalLogger,
      trace: () => {},
      debug: () => {},
      info:  () => {},
      warn:  (...args: any[]) => console.warn(`[Baileys:warn][${adminId}]`, ...args),
      error: (...args: any[]) => console.error(`[Baileys:error][${adminId}]`, ...args),
      fatal: (...args: any[]) => console.error(`[Baileys:fatal][${adminId}]`, ...args),
    };

    const sock = makeWASocket({
      version: waVersion,
      auth: state,
      printQRInTerminal: false,
      logger: minimalLogger as any,
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 30000,
    });

    activeSockets.set(adminId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      console.log(`[Baileys][${adminId}] connection.update → connection=${connection}, hasQR=${!!qr}`);

      if (qr) {
        clearQrTimeout(adminId); // QR received — cancel timeout
        try {
          const dataUrl = await QRCode.toDataURL(qr);
          qrCodeDataUrls.set(adminId, dataUrl);
          console.log(`[Baileys][${adminId}] QR generado e imagen dataURL creada.`);
        } catch (qrErr) {
          console.error(`[Baileys][${adminId}] QR Error:`, qrErr);
          lastErrors.set(adminId, 'Error al generar imagen QR.');
        }
      }

      if (connection === 'close') {
        clearQrTimeout(adminId);
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isInvalidSession = statusCode === 405;

        console.log(`[Baileys][${adminId}] Conexión cerrada. StatusCode=${statusCode} loggedOut=${isLoggedOut} invalidSession=${isInvalidSession}`);

        connectionStatuses.set(adminId, 'DISCONNECTED');
        qrCodeDataUrls.set(adminId, null);
        activeSockets.set(adminId, null);
        isInitializingMap.set(adminId, false);

        if (isLoggedOut || isInvalidSession) {
          if (fs.existsSync(authFolder)) {
            try {
              fs.rmSync(authFolder, { recursive: true, force: true });
              console.log(`[Baileys][${adminId}] Auth folder eliminado.`);
            } catch (rmErr) {
              console.error(`[Baileys][${adminId}] Error eliminando auth folder:`, rmErr);
            }
          }
          lastErrors.set(adminId, `Sesión inválida (${statusCode}). Por favor presiona "Conectar" para escanear un nuevo QR.`);
        } else {
          console.log(`[Baileys][${adminId}] Reconectando en 6 segundos...`);
          setTimeout(() => { initWhatsApp(adminId); }, 6000);
        }
      } else if (connection === 'open') {
        clearQrTimeout(adminId);
        console.log(`[Baileys][${adminId}] ✅ WhatsApp conectado exitosamente.`);
        connectionStatuses.set(adminId, 'CONNECTED');
        qrCodeDataUrls.set(adminId, null);
        lastErrors.set(adminId, null);
        isInitializingMap.set(adminId, false);
      }
    });
  } catch (err: any) {
    clearQrTimeout(adminId);
    console.error(`[Baileys][${adminId}] Init Error:`, err);
    lastErrors.set(adminId, err?.message || 'Error desconocido al iniciar WhatsApp.');
    connectionStatuses.set(adminId, 'DISCONNECTED');
    isInitializingMap.set(adminId, false);
  }
}

export function getWhatsAppStatus(adminId: string) {
  const status = connectionStatuses.get(adminId) || 'DISCONNECTED';
  const qr = qrCodeDataUrls.get(adminId);
  const error = lastErrors.get(adminId) || null;

  return {
    status,
    hasQR: !!qr,
    error,
  };
}

export function getWhatsAppQR(adminId: string) {
  return qrCodeDataUrls.get(adminId) || null;
}

export async function sendWhatsAppMessage(adminId: string, phoneNumber: string, message: string): Promise<boolean> {
  const sock = activeSockets.get(adminId);
  const status = connectionStatuses.get(adminId) || 'DISCONNECTED';

  if (!sock || status !== 'CONNECTED') {
    console.warn(`[Baileys][${adminId}] Send Warning: WhatsApp no está conectado.`);
    return false;
  }

  try {
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.length === 9) {
      cleanNumber = `51${cleanNumber}`;
    }
    const jid = `${cleanNumber}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: message });
    console.log(`[Baileys][${adminId}] Mensaje enviado a: ${jid}`);
    return true;
  } catch (err) {
    console.error(`[Baileys][${adminId}] Send Error enviando a ${phoneNumber}:`, err);
    return false;
  }
}

export async function disconnectWhatsApp(adminId: string) {
  clearQrTimeout(adminId);
  const sock = activeSockets.get(adminId);
  if (sock) {
    try { await sock.logout(); } catch (_e) {}
    activeSockets.set(adminId, null);
  }
  connectionStatuses.set(adminId, 'DISCONNECTED');
  qrCodeDataUrls.set(adminId, null);
  lastErrors.set(adminId, null);
  isInitializingMap.set(adminId, false);

  const authFolder = getAuthFolder(adminId);
  if (fs.existsSync(authFolder)) {
    fs.rmSync(authFolder, { recursive: true, force: true });
  }
  console.log(`[Baileys][${adminId}] Desconectado y credenciales eliminadas.`);
}
