import { prisma } from '../prismaClient';
import { sendWhatsAppMessage, getWhatsAppStatus } from './whatsapp';

// Registro en memoria de avisos enviados en el día (se resetea a medianoche)
const dailyNotifiedUsers = new Map<string, {
  date: string;
  sent5m: boolean;
  sent10m: boolean;
  sent20m: boolean;
  warningsCount: number;
}>();

export function getTodayDateString(): string {
  // Returns "YYYY-MM-DD" in America/Lima timezone
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
}

// Websocket / SSE Emitter handler callback
let callEmitter: ((userId: string, payload: any) => void) | null = null;

export function registerCallEmitter(fn: (userId: string, payload: any) => void) {
  callEmitter = fn;
}

export async function checkWorkerInactivityEngine() {
  const now = new Date();
  const todayStr = getTodayDateString();

  // Hora de inicio obligatoria: 8:55 AM en Zona Horaria de Lima (UTC-5)
  const startShift = new Date(`${todayStr}T08:55:00-05:00`);

  // Si aún no son las 8:55 AM (hora de Lima), no se aplican sanciones de inactividad
  if (now.getTime() < startShift.getTime()) {
    return;
  }

  try {
    // Cargar todos los administradores activos con su sede regional
    const admins = await prisma.users.findMany({
      where: {
        rol: 'admin',
        estado: 'activo',
      },
      include: {
        supervisor: {
          include: {
            location: true,
          },
        },
      },
    });

    // Cargar usuarios con rol 'usuario' activos
    const users = await prisma.users.findMany({
      where: {
        rol: 'usuario',
        estado: 'activo',
      },
      include: {
        supervisor: {
          include: {
            location: true,
          },
        },
        deviceDetail: true,
      },
    });

    for (const u of users) {
      const userPhone = u.supervisor?.telefono || u.supervisor?.doc || '';
      const userName = u.supervisor ? `${u.supervisor.nombres} ${u.supervisor.ape_pat}` : u.username;
      const workerSedeReg = u.supervisor?.location?.sede_reg;

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
      let lastSeen = u.deviceDetail?.last_seen_at || u.created_at || startShift;
      let lastSeenDate = new Date(lastSeen);

      // La referencia de inicio de conteo es la última señal o las 8:55 AM (lo que sea más reciente)
      let effectiveBaseline = lastSeenDate.getTime() < startShift.getTime() ? startShift : lastSeenDate;
      let inactiveMinutes = Math.floor((now.getTime() - effectiveBaseline.getTime()) / (60 * 1000));

      // --- VERIFICACIÓN DE UBICACIÓN EN VIVO PREVIA A NOTIFICACIÓN O LLAMADA ---
      if (inactiveMinutes >= 5) {
        // 1. Enviar solicitud de ping de ubicación por WebSocket al cliente si tiene sesión activa
        if (callEmitter) {
          callEmitter(u.id, { type: 'REQUEST_LOCATION_PING' });
        }

        // 2. Verificar la última posición/señal en device_details y trackings
        const latestDevice = await prisma.device_details.findUnique({ where: { id_user: u.id } });
        const latestTracking = await prisma.trackings.findFirst({
          where: { id_user: u.id },
          orderBy: { recorded_at: 'desc' }
        });

        const latestSignalMs = Math.max(
          latestDevice?.last_seen_at ? new Date(latestDevice.last_seen_at).getTime() : 0,
          latestTracking?.recorded_at ? new Date(latestTracking.recorded_at).getTime() : 0
        );

        if (latestSignalMs > 0) {
          const signalAgeMinutes = (now.getTime() - latestSignalMs) / (60 * 1000);
          if (signalAgeMinutes < 5) {
            // Se logró verificar la ubicación activa del supervisor
            record.sent5m = false;
            record.sent10m = false;
            record.sent20m = false;
            console.log(`[Inactivity Engine] Ubicación activa verificada para ${userName} (${u.id}). Estado de supervisor actualizado a ACTIVO. Se omiten avisos de inactividad.`);
            continue;
          }
        }
      }

      // Buscar administrador de la misma sede regional que tenga WhatsApp conectado
      const activeAdmin = admins.find((adm) => {
        const adminSedeReg = adm.supervisor?.location?.sede_reg;
        if (!adminSedeReg || !workerSedeReg || adminSedeReg !== workerSedeReg) return false;
        const wStatus = getWhatsAppStatus(adm.id);
        return wStatus.status === 'CONNECTED';
      });

      // --- ESCENARIO 1: T >= 5 MINUTOS (Y < 10 MINUTOS) ---
      if (inactiveMinutes >= 5 && inactiveMinutes < 10 && !record.sent5m) {
        record.sent5m = true;
        console.log(`[Inactivity Engine] 5m de inactividad detectados para ${userName} (${u.id})`);

        const msg5m = `Hola ${userName}, te saludamos del sistema GEOENLA (INEI). Te recordamos ingresar a la app y mantener encendida tu ubicación (GPS) para el registro correcto de tu jornada laboral. Si tienes algún inconveniente, puedes escribirnos por el Chat de la App.`;

        if (userPhone) {
          if (activeAdmin) {
            console.log(`[Inactivity Engine] Intentando enviar WhatsApp (5m) a ${userName} (${userPhone}) usando dispositivo de admin ${activeAdmin.username} (Región: ${workerSedeReg})...`);
            const sent = await sendWhatsAppMessage(activeAdmin.id, userPhone, msg5m);
            console.log(`[Inactivity Engine] WhatsApp (5m) enviado? ${sent}`);

            if (sent) {
              await prisma.whatsapp_logs.create({
                data: {
                  id_admin: activeAdmin.id,
                  id_receiver: u.supervisor!.id,
                  phone: userPhone,
                  message: msg5m,
                  sede_reg: workerSedeReg || 'No asignada',
                },
              }).catch((err) => console.error('[Inactivity Engine] Error guardando log WhatsApp:', err));
            }
          } else {
            console.warn(`[Inactivity Engine] ⚠️ WhatsApp de 5m NO enviado a ${userName}. No hay administrador conectado para la región "${workerSedeReg}".`);
          }
        }
      }

      // --- ESCENARIO 2: T >= 10 MINUTOS (Y < 20 MINUTOS) ---
      if (inactiveMinutes >= 10 && inactiveMinutes < 20 && !record.sent10m) {
        record.sent10m = true;
        record.warningsCount += 1;
        console.log(`[Inactivity Engine] 10m de inactividad detectados para ${userName}. Falta ${record.warningsCount}/3`);

        const msg10m = `ATENCIÓN ${userName}: El sistema GEOENLA(INEI) detecta tu ubicación deshabilitada. Te recordamos que la inactividad sin justificación constituye una falta. RECUERDA: 3 faltas significan el despido de inmediato. Por favor, activa tu ubicación (GPS) en la app GEOENLA de inmediato. (Llamada de atención ${record.warningsCount}/3)`;

        if (userPhone) {
          if (activeAdmin) {
            console.log(`[Inactivity Engine] Intentando enviar WhatsApp (10m) a ${userName} (${userPhone}) usando dispositivo de admin ${activeAdmin.username} (Región: ${workerSedeReg})...`);
            const sent = await sendWhatsAppMessage(activeAdmin.id, userPhone, msg10m);
            console.log(`[Inactivity Engine] WhatsApp (10m) enviado? ${sent}`);

            if (sent) {
              await prisma.whatsapp_logs.create({
                data: {
                  id_admin: activeAdmin.id,
                  id_receiver: u.supervisor!.id,
                  phone: userPhone,
                  message: msg10m,
                  sede_reg: workerSedeReg || 'No asignada',
                },
              }).catch((err) => console.error('[Inactivity Engine] Error guardando log WhatsApp:', err));
            }
          } else {
            console.warn(`[Inactivity Engine] ⚠️ WhatsApp de 10m NO enviado a ${userName}. No hay administrador conectado para la región "${workerSedeReg}".`);
          }
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
            message: 'Comunícate de inmediato con tu área para justificar tu inactividad o se tomará como falta de la jornada laboral.',
            ringtoneUrl: '/audio/november.mp3',
            audioUrl: '/audio/bicecly.mp3',
            autoHangupMs: 25000,
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
