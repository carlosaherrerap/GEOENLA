import { prisma } from '../index';
import { sendWhatsAppMessage } from './whatsapp';

// Registro en memoria de avisos enviados en el día (se resetea a medianoche)
const dailyNotifiedUsers = new Map<string, {
  date: string;
  sent5m: boolean;
  sent10m: boolean;
  sent20m: boolean;
  warningsCount: number;
}>();

export function getTodayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Websocket / SSE Emitter handler callback
let callEmitter: ((userId: string, payload: any) => void) | null = null;

export function registerCallEmitter(fn: (userId: string, payload: any) => void) {
  callEmitter = fn;
}

export async function checkWorkerInactivityEngine() {
  const now = new Date();
  const todayStr = getTodayDateString();

  // Hora de inicio obligatoria: 8:55 AM
  const startShift = new Date();
  startShift.setHours(8, 55, 0, 0);

  // Si aún no son las 8:55 AM, no se aplican sanciones de inactividad
  if (now.getTime() < startShift.getTime()) {
    return;
  }

  try {
    const users = await prisma.users.findMany({
      where: {
        rol: 'usuario',
        estado: 'activo',
      },
      include: {
        supervisor: true,
        deviceDetail: true,
      },
    });

    for (const u of users) {
      const userPhone = u.supervisor?.telefono || u.supervisor?.doc || '';
      const userName = u.supervisor ? `${u.supervisor.nombres} ${u.supervisor.ape_pat}` : u.username;

      // Obtener o inicializar registro diario
      let record = dailyNotifiedUsers.get(u.id);
      if (!record || record.date !== todayStr) {
        record = {
          date: todayStr,
          sent5m: false,
          sent10m: false,
          sent20m: false,
          warningsCount: 0,
        };
        dailyNotifiedUsers.set(u.id, record);
      }

      // Determinar la última señal recibida (last_seen_at)
      const lastSeen = u.deviceDetail?.last_seen_at || u.created_at || startShift;
      const lastSeenDate = new Date(lastSeen);
      
      // La referencia de inicio de conteo es la última señal o las 8:55 AM (lo que sea más reciente)
      const effectiveBaseline = lastSeenDate.getTime() < startShift.getTime() ? startShift : lastSeenDate;
      const inactiveMinutes = Math.floor((now.getTime() - effectiveBaseline.getTime()) / (60 * 1000));

      // --- ESCENARIO 1: T >= 5 MINUTOS (Y < 10 MINUTOS) ---
      if (inactiveMinutes >= 5 && inactiveMinutes < 10 && !record.sent5m) {
        record.sent5m = true;
        console.log(`[Inactivity Engine] 5m de inactividad detectados para ${userName} (${u.id})`);

        const msg5m = `Hola ${userName}, te saludamos del sistema GEOENLA (INEI). Te recordamos ingresar a la app y mantener encendida tu ubicación (GPS) para el registro correcto de tu jornada laboral. Si tienes algún inconveniente, puedes escribirnos por el Chat de la App.`;
        
        if (userPhone) {
          await sendWhatsAppMessage(userPhone, msg5m);
        }
      }

      // --- ESCENARIO 2: T >= 10 MINUTOS (Y < 20 MINUTOS) ---
      if (inactiveMinutes >= 10 && inactiveMinutes < 20 && !record.sent10m) {
        record.sent10m = true;
        record.warningsCount += 1;
        console.log(`[Inactivity Engine] 10m de inactividad detectados para ${userName}. Falta ${record.warningsCount}/3`);

        const msg10m = `ATENCIÓN ${userName}: El sistema INEI detecta tu ubicación deshabilitada. Te recordamos que la inactividad sin justificación constituye una falta. RECUERDA: 3 faltas significan el despido de inmediato. Por favor, activa tu ubicación (GPS) en la app GEOENLA de inmediato. (Llamada de atención ${record.warningsCount}/3)`;
        
        if (userPhone) {
          await sendWhatsAppMessage(userPhone, msg10m);
        }

        // Si acumula 3 llamadas de atención, inhabilitar la cuenta automáticamente
        if (record.warningsCount >= 3) {
          await prisma.users.update({
            where: { id: u.id },
            data: { estado: 'bloqueado' },
          }).catch((err) => console.error(`[Inactivity Engine] Error bloqueando usuario ${u.id}:`, err));

          console.log(`[Inactivity Engine] USUARIO BLOQUEADO automáticamente por acumular 3 faltas: ${userName}`);
        }
      }

      // --- ESCENARIO 3: T >= 20 MINUTOS (LLAMADA AUTOMATIZADA POR WEBSOCKET/AUDIO) ---
      if (inactiveMinutes >= 20 && !record.sent20m) {
        record.sent20m = true;
        console.log(`[Inactivity Engine] 20m de inactividad detectados para ${userName}. Disparando llamada automatizada...`);

        if (callEmitter) {
          callEmitter(u.id, {
            type: 'AUTOMATED_CALL',
            message: 'Comunícate de inmediato con tu área para justificar tu inactividad o se tomará como falta de la jornada.',
            audioUrl: '/audio/warning_call.mp3',
            autoHangupMs: 12000,
          });
        }
      }
    }
  } catch (err) {
    console.error('[Inactivity Engine Error]', err);
  }
}

// Iniciar cron del motor de inactividad cada 60 segundos
let engineInterval: any = null;

export function startInactivityEngine() {
  if (engineInterval) return;
  engineInterval = setInterval(checkWorkerInactivityEngine, 60 * 1000);
  console.log('[Inactivity Engine] Motor de monitoreo de inactividad iniciado (Ejecución cada 60s - Regla 8:55 AM).');
}
