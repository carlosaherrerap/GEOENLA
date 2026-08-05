import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';
import { uploadToR2 } from './r2Service';
import { setLatestUserLocation, getLatestUserLocations } from './redisClient';
import { initWhatsApp, getWhatsAppStatus, getWhatsAppQR, disconnectWhatsApp } from './services/whatsapp';
import { startInactivityEngine, registerCallEmitter } from './services/inactivityEngine';
import { updateDatabaseFromExcel } from './services/excelUpdater';
import { prisma } from './prismaClient';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';

// Fix global BigInt JSON serialization in Express
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Configuración Cloudflare R2 Storage
const R2_CONFIG = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  bucketName: process.env.R2_BUCKET_NAME || '',
  endpoint: process.env.R2_ENDPOINT || '',
  publicDomain: process.env.R2_PUBLIC_DOMAIN || '',
};

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Map of connected client sockets keyed by userId
const connectedClients = new Map<string, WebSocket>();

// Authenticate and handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/ws') {
    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token') || '';
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.id || decoded.userId;
    if (userId) {
      connectedClients.set(userId, ws);
      console.log(`[WebSocket] Usuario ${userId} conectado.`);

      ws.on('close', () => {
        if (connectedClients.get(userId) === ws) {
          connectedClients.delete(userId);
        }
        console.log(`[WebSocket] Usuario ${userId} desconectado.`);
      });
    }

  } catch (err) {
    ws.close(4001, 'Unauthorized');
  }
});

// Register call emitter callback to send automated warnings over WebSocket
registerCallEmitter((userId, payload) => {
  const ws = connectedClients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    console.log(`[WebSocket] Alerta de llamada enviada a usuario ${userId}.`);
  } else {
    console.warn(`[WebSocket] No se pudo enviar llamada a ${userId}: WebSocket no disponible.`);
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/audio', express.static(path.join(__dirname, 'src/audio')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Auth Middleware
const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No autenticado' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido' });
  }
};

const adminMiddleware = (req: any, res: any, next: any) => {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado. Requiere rol de administrador.' });
  }
  next();
};

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Servidor corriendo en el puerto ' + PORT,
    timestamp: new Date().toISOString(),
    database: 'connected',
  });
});

// R2 Diagnostic Health Check
app.get('/api/health/r2', async (req, res) => {
  try {
    const testFileName = `test_${Date.now()}.txt`;
    const testContent = Buffer.from('Testing Cloudflare R2 Connection');
    const publicUrl = await uploadToR2(testContent, testFileName, 'text/plain');
    res.json({
      status: 'ok',
      message: 'Conexión a Cloudflare R2 exitosa.',
      publicUrl,
      r2Config: {
        bucket: process.env.R2_BUCKET_NAME || 'goingup',
        hasAccountId: !!process.env.R2_ACCOUNT_ID,
        hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
        publicDomain: process.env.R2_PUBLIC_DOMAIN || '',
      }
    });
  } catch (err: any) {
    console.error('[R2 Health Diagnostic Failed]', err);
    res.status(500).json({
      status: 'error',
      message: 'Fallo al conectar con Cloudflare R2.',
      error: err.message,
      r2Config: {
        bucket: process.env.R2_BUCKET_NAME || 'goingup',
        hasAccountId: !!process.env.R2_ACCOUNT_ID,
        hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
        publicDomain: process.env.R2_PUBLIC_DOMAIN || '',
      }
    });
  }
});

app.get('/api/ping', (req, res) => res.json({ pong: true }));

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, correo, clave } = req.body;
    const identifier = (username || correo || '').trim();

    console.log(`[LOGIN ATTEMPT] Intento de acceso con usuario: ${identifier}`);

    const user = await prisma.users.findFirst({
      where: {
        OR: [
          { username: identifier },
          { correo: identifier },
        ]
      }
    });

    if (!user) {
      console.log(`[LOGIN FAILED] Usuario no encontrado: ${identifier}`);
      return res.status(401).json({ message: 'Credenciales incorrectas.' });
    }

    if (!bcrypt.compareSync(clave, user.clave)) {
      console.log(`[LOGIN FAILED] Contraseña incorrecta para: ${identifier}`);
      return res.status(401).json({ message: 'Credenciales incorrectas.' });
    }

    if (user.estado !== 'activo') {
      return res.status(403).json({ message: 'Tu cuenta está bloqueada. Contacta al administrador.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, correo: user.correo, rol: user.rol, estado: user.estado },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Actualizar o registrar device_details con last_seen_at para sesión ACTIVA al iniciar sesión
    await prisma.device_details.upsert({
      where: { id_user: user.id },
      update: { last_seen_at: new Date() },
      create: { id_user: user.id, last_seen_at: new Date() },
    }).catch(() => { });

    // Programar llamada de prueba por WebSockets exactamente 1 minuto después de iniciar sesión
    setTimeout(() => {
      const ws = connectedClients.get(user.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        const payload = {
          type: 'AUTOMATED_CALL',
          message: `Llamada de prueba: Hola ${user.username}, esta es una simulación de llamada de advertencia de inactividad de GEOENLA.`,
          ringtoneUrl: '/audio/november.mp3',
          audioUrl: '/audio/bicecly.mp3',
          autoHangupMs: 25000,
        };
        ws.send(JSON.stringify(payload));
        console.log(`[WebSocket] Llamada de prueba de 1 minuto enviada a usuario ${user.username} (${user.id}).`);
      } else {
        console.log(`[WebSocket] No se pudo realizar llamada de prueba a ${user.username} (WebSocket no conectado).`);
      }
    }, 60000);

    res.json({
      message: 'Login exitoso.',
      user: { id: user.id, username: user.username, correo: user.correo, rol: user.rol, estado: user.estado },
      token,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Protected routes
const protectedRoutes = express.Router();
protectedRoutes.use(authMiddleware);

// Auth Me
protectedRoutes.get('/me', async (req: any, res) => {
  const user = await prisma.users.findUnique({
    where: { id: req.user.id },
    include: { supervisor: true, deviceDetail: true },
  });
  res.json({ user });
});

protectedRoutes.post('/logout', async (req: any, res) => {
  if (req.user?.id) {
    await prisma.device_details.updateMany({
      where: { id_user: req.user.id },
      data: { last_seen_at: null },
    }).catch(() => { });
  }
  res.json({ message: 'Sesión cerrada exitosamente.' });
});

// Activities
protectedRoutes.get('/activities', async (req: any, res) => {
  const { fecha, estado, id_period, id_user } = req.query;
  const where: any = {};

  if (req.user.rol === 'usuario') {
    const routes = await prisma.routes.findMany({ where: { id_user: req.user.id }, select: { id_sede: true } });
    const locationIds = routes.map(r => r.id_sede);

    // Buscar también si req.user.id_supervisor existe
    const userDb = await prisma.users.findUnique({ where: { id: req.user.id }, select: { id_supervisor: true } });
    const userSuperId = userDb?.id_supervisor;

    const userOrConditions: any[] = [{ id_user: req.user.id }];
    if (userSuperId) {
      userOrConditions.push({ id_user: userSuperId });
    }
    if (locationIds.length > 0) {
      userOrConditions.push({ id_location: { in: locationIds } });
    }

    where.OR = userOrConditions;
  } else if (id_user) {
    where.id_user = id_user as string;
  }

  if (fecha) {
    const start = new Date(fecha as string);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    where.created_at = { gte: start, lt: end };
  }
  if (estado) where.estado = estado;
  if (id_period) where.id_period = id_period;

  const targetUserId = req.query.id_user || (req.user.rol === 'usuario' ? req.user.id : null);
  if (targetUserId) {
    where.OR = [
      { id_user: targetUserId },
      { activityUsers: { some: { id_user: targetUserId } } }
    ];
  }

  const activities = await prisma.activities.findMany({
    where,
    include: {
      period: true,
      location: { include: { ubiety: true } },
      route: true,
      activityUsers: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              correo: true,
              rol: true,
              supervisor: true
            }
          }
        }
      },
      user: {
        select: {
          id: true,
          username: true,
          correo: true,
          rol: true,
          supervisor: true
        }
      }
    },
    orderBy: { created_at: 'desc' },
  });

  // Garantizar la resolución del usuario si id_user apunta a supervisor.id o id_supervisor
  const mappedActivities = await Promise.all(
    activities.map(async (act) => {
      let userObj = act.user;
      if (!userObj && act.id_user) {
        const foundUser = await prisma.users.findFirst({
          where: {
            OR: [
              { id: act.id_user },
              { id_supervisor: act.id_user }
            ]
          },
          select: {
            id: true,
            username: true,
            correo: true,
            rol: true,
            supervisor: true
          }
        });
        if (foundUser) {
          userObj = foundUser;
        } else {
          const foundSupervisor = await prisma.supervisors.findUnique({
            where: { id: act.id_user }
          });
          if (foundSupervisor) {
            userObj = {
              id: foundSupervisor.id,
              username: `${foundSupervisor.nombres} ${foundSupervisor.ape_pat}`,
              correo: '',
              rol: 'usuario',
              supervisor: foundSupervisor
            } as any;
          }
        }
      }
      return {
        ...act,
        user: userObj
      };
    })
  );

  res.json({ data: mappedActivities });
});

protectedRoutes.get('/activities/:id', async (req, res) => {
  const activity = await prisma.activities.findUnique({
    where: { id: req.params.id },
    include: {
      period: true,
      location: { include: { ubiety: true } },
      user: { include: { supervisor: true } },
      activityUsers: { include: { user: { include: { supervisor: true } } } },
      evidence: true,
      attendances: { include: { user: { include: { supervisor: true } } } },
    },
  });
  if (!activity) return res.status(404).json({ message: 'Not found' });

  let userObj = activity.user;
  if (!userObj && activity.id_user) {
    const foundUser = await prisma.users.findFirst({
      where: {
        OR: [
          { id: activity.id_user },
          { id_supervisor: activity.id_user }
        ]
      },
      include: { supervisor: true }
    });
    if (foundUser) {
      userObj = foundUser;
    } else {
      const foundSupervisor = await prisma.supervisors.findUnique({
        where: { id: activity.id_user }
      });
      if (foundSupervisor) {
        userObj = {
          id: foundSupervisor.id,
          username: `${foundSupervisor.nombres} ${foundSupervisor.ape_pat}`,
          correo: '',
          rol: 'usuario',
          supervisor: foundSupervisor
        } as any;
      }
    }
  }

  res.json({ ...activity, user: userObj });
});

// Attendances
const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

protectedRoutes.post('/attendances/check-in', async (req: any, res) => {
  try {
    const { id_activity, id_location, lat, lng, observacion, photos, is_final } = req.body;

    if (!id_activity) {
      return res.status(400).json({ message: 'El ID de la actividad es requerido.' });
    }

    let targetLocationId = id_location;
    let locationObj: any = null;

    if (targetLocationId) {
      locationObj = await prisma.locations.findUnique({ where: { id: targetLocationId }, include: { ubiety: true } });
    }

    if (!locationObj) {
      const activityObj = await prisma.activities.findUnique({ where: { id: id_activity }, include: { location: { include: { ubiety: true } } } });
      if (activityObj && activityObj.location) {
        targetLocationId = activityObj.location.id;
        locationObj = activityObj.location;
      }
    }

    // Garantizar sede válida para actividades Sin Sede o libres (evita error de FK loc_default)
    if (!targetLocationId || !locationObj) {
      let defaultLoc = await prisma.locations.findFirst({
        where: {
          OR: [
            { nombre: { contains: 'Sin Sede', mode: 'insensitive' } },
            { nombre: { contains: 'libre', mode: 'insensitive' } }
          ]
        },
        include: { ubiety: true }
      });

      if (!defaultLoc) {
        const ubiety = await prisma.ubieties.create({
          data: {
            latitud: 0,
            longitud: 0,
            nombre: 'Sin Sede'
          }
        });
        defaultLoc = await prisma.locations.create({
          data: {
            id_ubiety: ubiety.id,
            nombre: 'Sin Sede (Ubicación Libre)',
            sede_reg: 'LIMA',
            sede_juris: 'LIMA'
          },
          include: { ubiety: true }
        });
      }

      targetLocationId = defaultLoc.id;
      locationObj = defaultLoc;
    }

    const sedeLat = locationObj?.ubiety?.latitud ? Number(locationObj.ubiety.latitud) : Number(lat || 0);
    const sedeLng = locationObj?.ubiety?.longitud ? Number(locationObj.ubiety.longitud) : Number(lng || 0);
    const rawLat = Number(lat ?? sedeLat);
    const rawLng = Number(lng ?? sedeLng);

    // Truncar latitud/longitud a máximo 7 decimales para evitar el error Decimal(10,7) numeric field overflow
    const currentLat = isNaN(rawLat) ? 0 : Number(rawLat.toFixed(7));
    const currentLng = isNaN(rawLng) ? 0 : Number(rawLng.toFixed(7));

    let distVal = 0;
    if (sedeLat !== 0 && sedeLng !== 0 && currentLat !== 0 && currentLng !== 0) {
      const calc = haversineDistance(currentLat, currentLng, sedeLat, sedeLng);
      distVal = isNaN(calc) || !isFinite(calc) ? 0 : Math.min(Math.max(0, calc), 99999.99);
    }
    const safeDistance = Number(distVal.toFixed(2));

    const isFreeLocation =
      locationObj?.nombre?.toLowerCase().includes('sin sede') ||
      locationObj?.nombre?.toLowerCase().includes('libre') ||
      (sedeLat === 0 && sedeLng === 0);

    if (!isFreeLocation && safeDistance > 25.0) {
      return res.status(422).json({
        message: `Te encuentras a ${safeDistance.toFixed(1)}m. Debes estar a 25 metros o menos de la sede para marcar asistencia.`,
        distance_m: safeDistance,
        sede_coords: { lat: sedeLat, lng: sedeLng },
      });
    }

    const newStatus = is_final || is_final === 'true' ? 'completado' : 'asistencia_marcada';

    // Subir fotos a Cloudflare R2 si vienen en base64
    const rawPhotos = Array.isArray(photos) ? photos : typeof photos === 'string' ? [photos] : [];

    if (isFreeLocation && rawPhotos.length === 0) {
      return res.status(400).json({
        message: 'Para actividades sin sede fija es obligatorio tomar y adjuntar al menos una foto de evidencia.',
      });
    }

    const uploadedPhotoUrls: string[] = [];

    for (let i = 0; i < rawPhotos.length; i++) {
      const item = rawPhotos[i];
      if (item && (item.startsWith('data:image') || item.length > 500)) {
        try {
          const r2Url = await uploadToR2(item, `attendance_${req.user.id}_${Date.now()}_${i}.jpg`);
          uploadedPhotoUrls.push(r2Url);
        } catch (uploadErr) {
          console.error('[CheckIn R2 Upload Error]', uploadErr);
          uploadedPhotoUrls.push(item);
        }
      } else if (item) {
        uploadedPhotoUrls.push(item);
      }
    }

    const attendance = await prisma.attendances.create({
      data: {
        id_user: req.user.id,
        id_activity,
        id_location: targetLocationId,
        lat: currentLat,
        lng: currentLng,
        distance_m: safeDistance,
        photos: uploadedPhotoUrls,
        observacion: observacion || (isFreeLocation ? 'Asistencia en ubicación libre (sin sede).' : 'Asistencia marcada desde la app.'),
        checked_in_at: new Date(),
        estado: newStatus,
      },
    });

    // Guardar también en la tabla evidencia (evidencias) para que figure disponible en la plataforma
    for (const photoUrl of uploadedPhotoUrls) {
      await prisma.evidence.create({
        data: {
          id_activity,
          descripcion: observacion || (isFreeLocation ? 'Evidencia de Marcación Libre (Sin Sede)' : 'Evidencia de Asistencia'),
          url: photoUrl
        }
      }).catch((evErr) => console.warn('[CheckIn] Error creando evidencia:', evErr));
    }

    // Actualizar estado de la actividad en la base de datos
    await prisma.activities.update({
      where: { id: id_activity },
      data: { estado: newStatus },
    }).catch((actErr) => {
      console.warn('[CheckIn] No se pudo actualizar estado de actividad:', actErr);
    });

    res.status(201).json({
      message: newStatus === 'completado' ? 'Actividad finalizada exitosamente.' : 'Asistencia registrada exitosamente.',
      attendance,
      estado: newStatus,
    });
  } catch (err: any) {
    console.error('[CheckIn ERROR]', err);
    res.status(500).json({ message: err.message || 'Error al procesar la asistencia.' });
  }
});

protectedRoutes.get('/attendances', async (req: any, res) => {
  const where: any = {};
  if (req.user.rol === 'usuario') {
    where.id_user = req.user.id;
  } else if (req.query.id_user) {
    where.id_user = req.query.id_user;
  }
  if (req.query.fecha) {
    const dStr = String(req.query.fecha).trim();
    where.checked_in_at = {
      gte: new Date(`${dStr}T00:00:00.000Z`),
      lte: new Date(`${dStr}T23:59:59.999Z`),
    };
  }

  const attendances = await prisma.attendances.findMany({
    where,
    include: { activity: true, location: true },
    orderBy: { checked_in_at: 'desc' },
    ...(req.query.fecha || req.query.id_user ? {} : { take: 100 }),
  });
  res.json({ data: attendances });
});

// Trackings
protectedRoutes.post('/trackings', async (req: any, res) => {
  const { id_activity, lat, lng, accuracy, speed, battery_level, recorded_at } = req.body;
  const serverNow = new Date();

  // Prevenir manipulación de reloj del teléfono o VPN: rechazar/sobrescribir si la hora del cliente es futura (> 1 min)
  let recordedDate = serverNow;
  if (recorded_at) {
    const clientDate = new Date(recorded_at);
    if (!isNaN(clientDate.getTime()) && clientDate.getTime() <= serverNow.getTime() + 60000) {
      recordedDate = clientDate;
    }
  }

  const tracking = await prisma.trackings.create({
    data: {
      id_user: req.user.id,
      id_activity: id_activity || null,
      lat, lng, accuracy, speed, battery_level,
      recorded_at: recordedDate,
      is_synced: true,
    }
  });

  // Store hot location in Redis cache for O(1) realtime lookup
  await setLatestUserLocation(req.user.id, {
    lat: Number(lat),
    lng: Number(lng),
    accuracy: accuracy ? Number(accuracy) : null,
    speed: speed ? Number(speed) : null,
    battery_level: battery_level ? Number(battery_level) : null,
    id_activity: id_activity || null,
    recorded_at: recordedDate.toISOString(),
  });

  // Update device_details last_seen_at for ACTIVO status
  await prisma.device_details.upsert({
    where: { id_user: req.user.id },
    update: { last_seen_at: serverNow },
    create: { id_user: req.user.id, last_seen_at: serverNow },
  }).catch(() => { });

  res.status(201).json({
    message: 'Punto registrado.',
    tracking: { ...tracking, id: tracking.id.toString() },
  });
});

const handleBatchTrackingSync = async (req: any, res: any) => {
  try {
    const rawPoints = req.body.points || req.body.trackings || req.body.operations || req.body.items || [];
    if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
      return res.status(200).json({ message: 'Sin puntos para sincronizar.', count: 0 });
    }

    const serverNow = new Date();

    // Ordenar cronológicamente por timestamp (recorded_at) y sanitizar con hora servidor si es futura
    const sortedPoints = rawPoints
      .filter((p: any) => p && (p.lat !== undefined || p.payload?.lat !== undefined))
      .map((p: any) => p.payload ? { ...p.payload, recorded_at: p.recorded_at || p.payload.recorded_at } : p)
      .sort((a: any, b: any) => new Date(a.recorded_at || a.timestamp || 0).getTime() - new Date(b.recorded_at || b.timestamp || 0).getTime());

    if (sortedPoints.length === 0) {
      return res.status(200).json({ message: 'Sin puntos válidos para sincronizar.', count: 0 });
    }

    const mappedPoints = sortedPoints.map((p: any) => {
      let ptDate = p.recorded_at ? new Date(p.recorded_at) : (p.timestamp ? new Date(p.timestamp) : serverNow);
      if (isNaN(ptDate.getTime()) || ptDate.getTime() > serverNow.getTime() + 60000) {
        ptDate = serverNow;
      }
      return {
        id_user: req.user.id,
        id_activity: p.id_activity || null,
        lat: Number(p.lat),
        lng: Number(p.lng),
        accuracy: p.accuracy ? Number(p.accuracy) : null,
        speed: p.speed ? Number(p.speed) : null,
        battery_level: p.battery_level ? Number(p.battery_level) : null,
        recorded_at: ptDate,
        is_synced: true,
      };
    });

    await prisma.trackings.createMany({ data: mappedPoints });

    // Actualizar última posición en cache Redis con el último punto del lote cronológico
    const lastPoint = mappedPoints[mappedPoints.length - 1];
    await setLatestUserLocation(req.user.id, {
      lat: lastPoint.lat,
      lng: lastPoint.lng,
      accuracy: lastPoint.accuracy,
      speed: lastPoint.speed,
      battery_level: lastPoint.battery_level,
      id_activity: lastPoint.id_activity,
      recorded_at: lastPoint.recorded_at.toISOString(),
    }).catch(() => { });

    // Actualizar estado del dispositivo a ACTIVO
    await prisma.device_details.upsert({
      where: { id_user: req.user.id },
      update: { last_seen_at: new Date() },
      create: { id_user: req.user.id, last_seen_at: new Date() },
    }).catch(() => { });

    console.log(`[SyncBatch] ${mappedPoints.length} puntos offline sincronizados para usuario ${req.user.username || req.user.id}`);

    res.status(200).json({ message: `${mappedPoints.length} puntos sincronizados correctamente.`, count: mappedPoints.length });
  } catch (err: any) {
    console.error('[SyncBatch ERROR]', err);
    res.status(500).json({ message: err.message || 'Error al procesar la sincronización.' });
  }
};

protectedRoutes.post('/trackings/bulk', handleBatchTrackingSync);
protectedRoutes.post('/trackings/sync-batch', handleBatchTrackingSync);
protectedRoutes.post('/sync', handleBatchTrackingSync);

// Real-time live locations from Redis (Fast O(1) read for 60+ users)
protectedRoutes.get('/trackings/live', async (req: any, res) => {
  const requestedUserId = req.query.id_user as string | undefined;
  const userIds = requestedUserId ? [requestedUserId] : undefined;

  const redisData = await getLatestUserLocations(userIds);
  if (redisData && Object.keys(redisData).length > 0) {
    return res.json({ source: 'redis', data: redisData });
  }

  // Fallback to PostgreSQL if Redis cache is empty or offline
  const where: any = {};
  if (req.user.rol === 'usuario') where.id_user = req.user.id;
  else if (requestedUserId) where.id_user = requestedUserId;

  const latestPoints = await prisma.trackings.findMany({
    where,
    orderBy: { recorded_at: 'desc' },
    distinct: ['id_user'],
    take: 100,
  });

  const fallbackMap: Record<string, any> = {};
  latestPoints.forEach((p) => {
    fallbackMap[p.id_user] = {
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracy: p.accuracy ? Number(p.accuracy) : null,
      speed: p.speed ? Number(p.speed) : null,
      battery_level: p.battery_level ? Number(p.battery_level) : null,
      id_activity: p.id_activity,
      recorded_at: p.recorded_at.toISOString(),
    };
  });

  res.json({ source: 'database', data: fallbackMap });
});

protectedRoutes.get('/trackings', async (req: any, res) => {
  const where: any = {};
  if (req.user.rol === 'usuario') where.id_user = req.user.id;
  else if (req.query.id_user) where.id_user = req.query.id_user;
  if (req.query.id_activity) where.id_activity = req.query.id_activity;

  if (req.query.fecha) {
    const dStr = String(req.query.fecha).trim();
    where.recorded_at = {
      gte: new Date(`${dStr}T00:00:00.000Z`),
      lte: new Date(`${dStr}T23:59:59.999Z`),
    };
  }

  const trackings = await prisma.trackings.findMany({
    where,
    select: { id: true, id_user: true, id_activity: true, lat: true, lng: true, accuracy: true, speed: true, recorded_at: true },
    orderBy: { recorded_at: 'asc' },
  });
  const mapped = trackings.map(t => ({ ...t, id: t.id.toString() }));
  res.json({ data: mapped });
});

// Pedestrian Route Endpoint using OSRM with dynamic local/public URL fallback
protectedRoutes.get('/routes/osrm-foot', async (req: any, res) => {
  const { start_lat, start_lng, end_lat, end_lng } = req.query;
  if (!start_lat || !start_lng || !end_lat || !end_lng) {
    return res.status(400).json({ message: 'Coordenadas de origen y destino requeridas.' });
  }

  // Use local docker OSRM URL if defined, else fallback to public OSRM API
  const osrmBaseUrl = process.env.OSRM_URL || 'https://router.project-osrm.org';
  const osrmUrl = `${osrmBaseUrl}/route/v1/foot/${start_lng},${start_lat};${end_lng},${end_lat}?overview=full&geometries=geojson&steps=true`;

  try {
    const response = await fetch(osrmUrl);
    if (!response.ok) {
      // If local OSRM fails, fallback to public OSRM
      if (osrmBaseUrl !== 'https://router.project-osrm.org') {
        const publicUrl = `https://router.project-osrm.org/route/v1/foot/${start_lng},${start_lat};${end_lng},${end_lat}?overview=full&geometries=geojson&steps=true`;
        const pubResponse = await fetch(publicUrl);
        const pubData = await pubResponse.json();
        return res.json(pubData);
      }
      throw new Error(`OSRM API response status ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('[OSRM Proxy Error]', error.message);
    res.status(500).json({ message: 'Error consultando servicio de ruteo peatonal OSRM.', error: error.message });
  }
});

// Pedestrian Map Matching Endpoint using OSRM to snap raw GPS points onto sidewalks and streets
protectedRoutes.get('/routes/osrm-match', async (req: any, res) => {
  const { coordinates } = req.query; // format: "lng1,lat1;lng2,lat2;lng3,lat3"
  if (!coordinates || typeof coordinates !== 'string') {
    return res.json({ matchings: [] });
  }

  // Limitar cantidad de puntos de coordenadas para evitar URLs gigantes que fallen en OSRM
  const coordArray = coordinates.split(';');
  let finalCoords = coordinates;
  if (coordArray.length > 40) {
    const step = Math.ceil(coordArray.length / 40);
    const sampled = coordArray.filter((_, idx) => idx % step === 0);
    finalCoords = sampled.join(';');
  }

  const osrmBaseUrl = process.env.OSRM_URL || 'https://router.project-osrm.org';
  const osrmUrl = `${osrmBaseUrl}/match/v1/foot/${finalCoords}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(osrmUrl);
    if (!response.ok) {
      if (osrmBaseUrl !== 'https://router.project-osrm.org') {
        const publicUrl = `https://router.project-osrm.org/match/v1/foot/${finalCoords}?overview=full&geometries=geojson`;
        const pubResponse = await fetch(publicUrl).catch(() => null);
        if (pubResponse && pubResponse.ok) {
          const pubData = await pubResponse.json();
          return res.json(pubData);
        }
      }
      return res.json({ matchings: [] });
    }
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.warn('[OSRM Match Warning]', error.message);
    res.json({ matchings: [] });
  }
});

// Device details
protectedRoutes.post('/device', async (req: any, res) => {
  const data = req.body;
  const existing = await prisma.device_details.findUnique({ where: { id_user: req.user.id } });

  const payload = {
    manufacturer: data.manufacturer,
    model: data.model,
    os: data.os,
    os_version: data.os_version,
    battery_level: data.battery_level,
    battery_state: data.battery_state,
    app_version: data.app_version,
    last_seen_at: new Date(),
  };

  const device = existing
    ? await prisma.device_details.update({ where: { id_user: req.user.id }, data: payload })
    : await prisma.device_details.create({ data: { ...payload, id_user: req.user.id } });

  res.json({ message: 'Detalle del dispositivo actualizado.', device });
});

protectedRoutes.get('/device', async (req: any, res) => {
  const device = await prisma.device_details.findUnique({ where: { id_user: req.user.id } });
  res.json(device);
});

// Chat Endpoints
protectedRoutes.get('/users/all', async (req: any, res) => {
  try {
    const users = await prisma.users.findMany({
      where: { id: { not: req.user.id } },
      include: {
        deviceDetail: true,
        supervisor: { include: { location: true, schedule: true, ubiety: true } },
      },
      orderBy: { username: 'asc' },
    });

    const now = Date.now();
    const mappedUsers = users.map((u: any) => {
      const lastSeen = u.deviceDetail?.last_seen_at || u.last_seen_at;
      const isAppActive = lastSeen ? (now - new Date(lastSeen).getTime()) < 15 * 60 * 1000 : false;
      return {
        ...u,
        is_app_active: isAppActive,
      };
    });

    res.json({ data: mappedUsers });
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo usuarios' });
  }
});

protectedRoutes.get('/chats', async (req: any, res) => {
  try {
    const currentUserId = req.user.id;
    const chats = await prisma.chats.findMany({
      where: {
        OR: [{ id_user_1: currentUserId }, { id_user_2: currentUserId }],
      },
      include: {
        user1: { select: { id: true, username: true, correo: true, rol: true, estado: true, deviceDetail: true } },
        user2: { select: { id: true, username: true, correo: true, rol: true, estado: true, deviceDetail: true } },
        talks: { orderBy: { fec_envio: 'desc' }, take: 1 },
      },
      orderBy: { last_update_chat: 'desc' },
    });

    res.json({ data: chats });
  } catch (err) {
    res.status(500).json({ message: 'Error cargando chats' });
  }
});

protectedRoutes.post('/chats', async (req: any, res) => {
  try {
    const currentUserId = req.user.id;
    const { id_user_target } = req.body;

    if (!id_user_target) return res.status(400).json({ message: 'Target user ID requerido' });

    let chat = await prisma.chats.findFirst({
      where: {
        OR: [
          { id_user_1: currentUserId, id_user_2: id_user_target },
          { id_user_1: id_user_target, id_user_2: currentUserId },
        ],
      },
      include: {
        user1: { select: { id: true, username: true, correo: true, rol: true, estado: true } },
        user2: { select: { id: true, username: true, correo: true, rol: true, estado: true } },
      },
    });

    if (!chat) {
      chat = await prisma.chats.create({
        data: {
          id_user_1: currentUserId,
          id_user_2: id_user_target,
          last_update_chat: new Date(),
        },
        include: {
          user1: { select: { id: true, username: true, correo: true, rol: true, estado: true } },
          user2: { select: { id: true, username: true, correo: true, rol: true, estado: true } },
        },
      });
    }

    res.json({ data: chat });
  } catch (err) {
    res.status(500).json({ message: 'Error al iniciar conversación' });
  }
});

protectedRoutes.get('/users/all', async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      include: { deviceDetail: true, supervisor: true },
      orderBy: { username: 'asc' }
    });
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ message: 'Error cargando usuarios' });
  }
});

protectedRoutes.get('/chats/:id/messages', async (req: any, res) => {
  try {
    // Actualizar mensajes enviados por la otra persona como 'leido'
    await prisma.talks.updateMany({
      where: {
        id_chat: req.params.id,
        id_user_send_message: { not: req.user.id },
        estado: 'enviado',
      },
      data: {
        estado: 'leido',
      },
    });

    const messages = await prisma.talks.findMany({
      where: { id_chat: req.params.id },
      include: { sender: { select: { id: true, username: true, correo: true } } },
      orderBy: { fec_envio: 'asc' },
    });
    res.json({ data: messages });
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo mensajes' });
  }
});

protectedRoutes.post('/chats/:id/messages', async (req: any, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ message: 'Texto de mensaje es requerido' });

    const message = await prisma.talks.create({
      data: {
        id_chat: req.params.id,
        id_user_send_message: req.user.id,
        texto,
        fec_envio: new Date(),
        estado: 'enviado',
      },
      include: { sender: { select: { id: true, username: true, correo: true } } },
    });

    await prisma.chats.update({
      where: { id: req.params.id },
      data: { last_update_chat: new Date() },
    });

    res.status(201).json({ data: message });
  } catch (err) {
    res.status(500).json({ message: 'Error al enviar mensaje' });
  }
});

// Locations
protectedRoutes.get('/locations', async (req, res) => {
  const locations = await prisma.locations.findMany({
    include: { ubiety: true },
    orderBy: { nombre: 'asc' }
  });
  res.json({ data: locations });
});

// Periods
protectedRoutes.get('/periods', async (req, res) => {
  const periods = await prisma.periods.findMany({
    orderBy: { fec_inicio: 'desc' }
  });
  res.json({ data: periods });
});

// Schedules
protectedRoutes.get('/schedules', async (req, res) => {
  const schedules = await prisma.schedules.findMany({
    orderBy: { created_at: 'desc' }
  });
  res.json({ data: schedules });
});

// Users simple list for dropdowns (solo usuarios de campo)
protectedRoutes.get('/users/list', async (req, res) => {
  const users = await prisma.users.findMany({
    where: { rol: 'usuario' },
    select: {
      id: true,
      username: true,
      correo: true,
      rol: true,
      supervisor: { select: { nombres: true, ape_pat: true } }
    },
    orderBy: { username: 'asc' }
  });
  res.json({ data: users });
});

// Admin routes
const adminRoutes = express.Router();
adminRoutes.use(adminMiddleware);

adminRoutes.get('/users', async (req, res) => {
  try {
    const { search, estado, rol, per_page } = req.query as any;
    const where: any = {};

    if (estado) where.estado = estado;
    if (rol) where.rol = rol;
    if (search) {
      const s = String(search).trim();
      where.OR = [
        { username: { contains: s, mode: 'insensitive' } },
        { correo: { contains: s, mode: 'insensitive' } },
        { supervisor: { nombres: { contains: s, mode: 'insensitive' } } },
        { supervisor: { ape_pat: { contains: s, mode: 'insensitive' } } },
        { supervisor: { ape_mat: { contains: s, mode: 'insensitive' } } },
        { supervisor: { doc: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const takeParam = per_page ? Number(per_page) : (search || rol || estado ? undefined : 200);

    const users = await prisma.users.findMany({
      where,
      include: { supervisor: { include: { location: true, schedule: true, ubiety: true } }, deviceDetail: true },
      orderBy: { created_at: 'desc' },
      ...(takeParam ? { take: takeParam } : {}),
    });

    const now = Date.now();
    const mappedUsers = users.map((u: any) => {
      const lastSeen = u.deviceDetail?.last_seen_at || u.last_seen_at;
      const isAppActive = lastSeen ? (now - new Date(lastSeen).getTime()) < 15 * 60 * 1000 : false;
      return {
        ...u,
        is_app_active: isAppActive,
      };
    });

    res.json({ data: mappedUsers });
  } catch (err) {
    res.status(500).json({ message: 'Error cargando usuarios' });
  }
});

adminRoutes.get('/users/:id', async (req, res) => {
  const user = await prisma.users.findUnique({
    where: { id: req.params.id },
    include: { supervisor: { include: { location: true, schedule: true, ubiety: true } }, deviceDetail: true },
  });
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  res.json(user);
});

// Crear Usuario completo en 3 Pasos (Supervisor + Account + Location + Shift)
adminRoutes.post('/users', async (req: any, res: any) => {
  try {
    const {
      nombres, ape_pat, ape_mat, doc, nacionalidad, genero, telefono, direccion,
      username, clave, correo, rol,
      id_location, sede_reg, sede_juris, hogar_lat, hogar_long,
      id_turno, turno_tipo, turno_ingreso, turno_salida
    } = req.body;

    if (!username || !clave || !correo || !nombres || !doc) {
      return res.status(400).json({ message: 'Campos requeridos faltantes (nombres, doc, username, clave, correo).' });
    }

    // Validaciones de formato de Documento (8 a 11 dígitos) y Teléfono (9 dígitos)
    const docClean = String(doc).trim();
    if (!/^\d{8,11}$/.test(docClean)) {
      return res.status(400).json({ message: 'El documento debe contener entre 8 y 11 dígitos numéricos.' });
    }

    if (telefono) {
      const telClean = String(telefono).trim();
      if (!/^\d{9}$/.test(telClean)) {
        return res.status(400).json({ message: 'El teléfono debe contener exactamente 9 dígitos numéricos.' });
      }
    }

    // 1. Obtener o crear Turno (schedules)
    let selectedShiftId = id_turno;
    if (!selectedShiftId) {
      const tipoShift = turno_tipo || 'DIURNO';
      const ingStr = turno_ingreso || '08:00';
      const salStr = turno_salida || '17:00';

      const ingDate = new Date(`1970-01-01T${ingStr}:00Z`);
      const salDate = new Date(`1970-01-01T${salStr}:00Z`);

      const newSchedule = await prisma.schedules.create({
        data: {
          tipo: tipoShift,
          ingreso: ingDate,
          salida: salDate,
        }
      });
      selectedShiftId = newSchedule.id;
    }

    // 2. Crear Ubiety para el hogar del supervisor (Paso 2)
    const homeUbiety = await prisma.ubieties.create({
      data: {
        latitud: hogar_lat !== undefined && hogar_lat !== '' ? Number(hogar_lat) : -12.046374,
        longitud: hogar_long !== undefined && hogar_long !== '' ? Number(hogar_long) : -77.042793,
      }
    });

    // 3. Determinar id_location de la Sede
    let targetLocationId = id_location;
    if (!targetLocationId) {
      const existingLoc = await prisma.locations.findFirst({
        where: { sede_reg: sede_reg || 'LIMA' }
      });
      if (existingLoc) {
        targetLocationId = existingLoc.id;
      } else {
        const defaultLocUbiety = await prisma.ubieties.create({
          data: { latitud: -12.046374, longitud: -77.042793 }
        });
        const newLoc = await prisma.locations.create({
          data: {
            sede_reg: sede_reg || 'LIMA',
            sede_juris: sede_juris || 'LIMA',
            nombre: `Sede ${sede_reg || 'LIMA'}`,
            id_ubiety: defaultLocUbiety.id,
          }
        });
        targetLocationId = newLoc.id;
      }
    }

    // 4. Crear Supervisor
    const supervisor = await prisma.supervisors.create({
      data: {
        nombres,
        ape_pat: ape_pat || '',
        ape_mat: ape_mat || '',
        doc,
        nacionalidad: nacionalidad || 'PERUANA',
        genero: genero || 'MASCULINO',
        telefono: telefono || doc,
        direccion: direccion || 'Sin dirección',
        id_location: targetLocationId,
        id_ubiety: homeUbiety.id,
        id_turno: selectedShiftId,
      }
    });

    // 5. Crear Usuario
    const hashedPassword = bcrypt.hashSync(clave, 10);
    const user = await prisma.users.create({
      data: {
        id_supervisor: supervisor.id,
        username,
        clave: hashedPassword,
        correo,
        rol: rol || 'usuario',
        estado: 'activo',
      },
      include: { supervisor: { include: { location: true, schedule: true } } }
    });

    res.status(201).json({ message: 'Usuario registrado exitosamente en los 3 pasos.', user });
  } catch (err: any) {
    console.error('[CreateUser ERROR]', err);
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'El correo, documento, teléfono o nombre de usuario ya se encuentra registrado.' });
    }
    res.status(500).json({ message: err.message || 'Error al registrar el usuario.' });
  }
});

adminRoutes.patch('/users/:id/toggle-block', async (req, res) => {
  const user = await prisma.users.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

  const updated = await prisma.users.update({
    where: { id: req.params.id },
    data: { estado: user.estado === 'activo' ? 'bloqueado' : 'activo' }
  });

  res.json({ message: `Estado actualizado a ${updated.estado}`, user: updated });
});

// Crear Sede con Ubicación obligatoria lat/long
adminRoutes.post('/locations', async (req: any, res: any) => {
  try {
    const { sede_reg, sede_juris, nombre, latitud, longitud } = req.body;
    if (!sede_reg || !sede_juris || !nombre || latitud === undefined || longitud === undefined) {
      return res.status(400).json({ message: 'Todos los campos son requeridos (sede_reg, sede_juris, nombre, latitud, longitud).' });
    }

    const ubiety = await prisma.ubieties.create({
      data: {
        latitud: Number(latitud),
        longitud: Number(longitud)
      }
    });

    const location = await prisma.locations.create({
      data: {
        sede_reg,
        sede_juris,
        nombre,
        id_ubiety: ubiety.id
      },
      include: { ubiety: true }
    });

    res.status(201).json({ message: 'Sede creada exitosamente con su ubicación.', location });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error al crear la sede.' });
  }
});

// Endpoints de Conectividad WhatsApp Baileys
const handleWhatsAppStatus = async (req: any, res: any) => {
  try {
    const adminId = req.user.id;
    const adminInfo = await prisma.users.findUnique({
      where: { id: adminId },
      include: {
        supervisor: {
          include: {
            location: true
          }
        }
      }
    });

    const sede_reg = adminInfo?.supervisor?.location?.sede_reg || 'No asignada';
    const sede_juris = adminInfo?.supervisor?.location?.sede_juris || 'No asignada';

    res.json({
      ...getWhatsAppStatus(adminId),
      sede_reg,
      sede_juris,
      rol: req.user.rol
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error al obtener estado.' });
  }
};

const handleWhatsAppQR = (req: any, res: any) => {
  const qr = getWhatsAppQR(req.user.id);
  res.json({ qr });
};

const handleWhatsAppConnect = async (req: any, res: any) => {
  await initWhatsApp(req.user.id);
  res.json({ message: 'Iniciando conexión de WhatsApp...' });
};

const handleWhatsAppDisconnect = async (req: any, res: any) => {
  await disconnectWhatsApp(req.user.id);
  res.json({ message: 'WhatsApp desconectado correctamente.' });
};

adminRoutes.get('/whatsapp/status', handleWhatsAppStatus);
adminRoutes.get('/admin/whatsapp/status', handleWhatsAppStatus);

adminRoutes.get('/whatsapp/qr', handleWhatsAppQR);
adminRoutes.get('/admin/whatsapp/qr', handleWhatsAppQR);

adminRoutes.post('/whatsapp/connect', handleWhatsAppConnect);
adminRoutes.post('/admin/whatsapp/connect', handleWhatsAppConnect);

adminRoutes.post('/whatsapp/disconnect', handleWhatsAppDisconnect);
adminRoutes.post('/admin/whatsapp/disconnect', handleWhatsAppDisconnect);

adminRoutes.post('/admin/db/sync-excel', async (_req: any, res: any) => {
  try {
    const result = await updateDatabaseFromExcel();
    res.json({ message: 'Sincronización de base de datos desde Excel completada.', result });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error en sincronización desde Excel.' });
  }
});

// =============================================
// Endpoints de Asignación de Sedes a Admins (solo su)
// =============================================

// Listar todas las asignaciones actuales
adminRoutes.get('/admin/sede-assignments', async (req: any, res: any) => {
  if (req.user.rol !== 'su') return res.status(403).json({ message: 'Solo el superusuario puede gestionar asignaciones.' });
  try {
    const assignments = await prisma.admin_sedes.findMany({
      include: {
        user: { select: { id: true, username: true, correo: true } },
        location: { select: { id: true, sede_reg: true, nombre: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(assignments);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Listar admins disponibles (rol='admin')
adminRoutes.get('/admin/sede-assignments/admins', async (req: any, res: any) => {
  if (req.user.rol !== 'su') return res.status(403).json({ message: 'Solo el superusuario puede gestionar asignaciones.' });
  try {
    const admins = await prisma.users.findMany({
      where: { rol: 'admin', estado: 'activo' },
      select: {
        id: true,
        username: true,
        correo: true,
        supervisor: { select: { nombres: true, ape_pat: true } },
        adminSedes: {
          include: { location: { select: { id: true, sede_reg: true } } }
        }
      },
      orderBy: { username: 'asc' }
    });
    res.json(admins);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Listar todas las sedes con info de a quién están asignadas
adminRoutes.get('/admin/sede-assignments/sedes', async (req: any, res: any) => {
  if (req.user.rol !== 'su') return res.status(403).json({ message: 'Solo el superusuario puede gestionar asignaciones.' });
  try {
    const sedes = await prisma.locations.findMany({
      select: {
        id: true,
        sede_reg: true,
        nombre: true,
        adminSedes: {
          include: { user: { select: { id: true, username: true } } }
        }
      },
      orderBy: { sede_reg: 'asc' }
    });
    res.json(sedes);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Reemplazar las sedes asignadas a un admin específico
adminRoutes.put('/admin/sede-assignments/:adminId', async (req: any, res: any) => {
  if (req.user.rol !== 'su') return res.status(403).json({ message: 'Solo el superusuario puede gestionar asignaciones.' });
  const { adminId } = req.params;
  const { locationIds } = req.body; // Array de id_location

  if (!Array.isArray(locationIds)) {
    return res.status(400).json({ message: 'locationIds debe ser un array.' });
  }

  try {
    // Verificar que el admin existe y tiene rol='admin'
    const admin = await prisma.users.findFirst({ where: { id: adminId, rol: 'admin' } });
    if (!admin) return res.status(404).json({ message: 'Administrador no encontrado.' });

    // Verificar que ninguna sede nueva esté asignada a otro admin
    if (locationIds.length > 0) {
      const conflicts = await prisma.admin_sedes.findMany({
        where: {
          id_location: { in: locationIds },
          id_user: { not: adminId }
        },
        include: { user: { select: { username: true } }, location: { select: { sede_reg: true } } }
      });
      if (conflicts.length > 0) {
        const detail = conflicts.map(c => `${c.location.sede_reg} -> ${c.user.username}`).join(', ');
        return res.status(409).json({ message: `Sedes ya asignadas a otros admins: ${detail}` });
      }
    }

    // Transacción: eliminar las antiguas y crear las nuevas
    await prisma.$transaction([
      prisma.admin_sedes.deleteMany({ where: { id_user: adminId } }),
      ...locationIds.map((locId: string) =>
        prisma.admin_sedes.create({ data: { id_user: adminId, id_location: locId } })
      )
    ]);

    res.json({ message: 'Asignación de sedes actualizada correctamente.' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Endpoint de Historial de WhatsApp (disponible para admins y su)
protectedRoutes.get('/whatsapp/messages', async (req: any, res: any) => {
  const { rol, id } = req.user;
  const { sede_reg } = req.query;

  if (rol !== 'admin' && rol !== 'su') {
    return res.status(403).json({ message: 'Acceso denegado. Rol no autorizado.' });
  }

  try {
    let whereClause: any = {};

    if (rol === 'admin') {
      // Filtrar por sedes asignadas en admin_sedes
      const assigned = await prisma.admin_sedes.findMany({
        where: { id_user: id },
        include: { location: true }
      });
      if (assigned.length > 0) {
        whereClause.sede_reg = { in: assigned.map((a: any) => a.location.sede_reg) };
      } else {
        // Sin sedes asignadas = sin chats
        return res.json([]);
      }
    } else if (rol === 'su') {
      if (sede_reg) {
        whereClause.sede_reg = String(sede_reg);
      }
    }

    const logs = await prisma.whatsapp_logs.findMany({
      where: whereClause,
      orderBy: { sent_at: 'desc' },
      include: {
        admin: {
          select: {
            username: true,
            correo: true,
            supervisor: {
              select: {
                nombres: true,
                ape_pat: true
              }
            }
          }
        },
        receiver: {
          select: {
            nombres: true,
            ape_pat: true,
            ape_mat: true,
            telefono: true,
            location: {
              select: {
                nombre: true,
                sede_reg: true
              }
            }
          }
        }
      }
    });

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error al obtener el historial de mensajes.' });
  }
});

// Server Date
app.get('/api/server-date', (req, res) => {
  const now = new Date();
  const limaDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
  const limaTimeStr = now.toLocaleTimeString('es-PE', { timeZone: 'America/Lima' });
  res.json({
    iso: now.toISOString(),
    serverDate: limaDateStr,
    serverTime: limaTimeStr,
    timestamp: now.getTime(),
    timezone: 'America/Lima'
  });
});

// Routes API
protectedRoutes.get('/routes', async (req: any, res) => {
  try {
    const { id_sede, id_period } = req.query;
    const where: any = {};
    if (id_sede) where.id_sede = id_sede;
    if (id_period) where.id_period = id_period;

    const routesList = await prisma.routes.findMany({
      where,
      include: {
        location: true,
        period: true,
        user: { select: { id: true, username: true, correo: true, supervisor: true } },
        routeUsers: { include: { user: { select: { id: true, username: true, correo: true, supervisor: true } } } },
        activities: {
          include: {
            user: { select: { id: true, username: true, correo: true, supervisor: true } },
            activityUsers: { include: { user: { select: { id: true, username: true, correo: true, supervisor: true } } } }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json({ data: routesList });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error al obtener las rutas.' });
  }
});

adminRoutes.post('/routes', async (req: any, res: any) => {
  try {
    const { nombre, id_sede, id_period, fec_visita, activity_ids, user_ids } = req.body;

    if (!nombre || !id_sede || !id_period || !fec_visita) {
      return res.status(400).json({ message: 'nombre, id_sede, id_period y fec_visita son requeridos.' });
    }

    const primaryUserId = Array.isArray(user_ids) && user_ids.length > 0 ? user_ids[0] : null;

    const route = await prisma.routes.create({
      data: {
        nombre,
        id_sede,
        id_period,
        id_user: primaryUserId,
        fec_visita: new Date(fec_visita),
        fec_asignado: new Date(),
        estado: 'pendiente'
      }
    });

    if (Array.isArray(user_ids) && user_ids.length > 0) {
      await prisma.route_users.createMany({
        data: user_ids.map((uid: string) => ({
          id_route: route.id,
          id_user: uid
        })),
        skipDuplicates: true
      });
    }

    if (Array.isArray(activity_ids) && activity_ids.length > 0) {
      await prisma.activities.updateMany({
        where: { id: { in: activity_ids } },
        data: {
          id_route: route.id,
          ...(primaryUserId ? { id_user: primaryUserId } : {})
        }
      });

      if (Array.isArray(user_ids) && user_ids.length > 0) {
        const activityUserRecords: any[] = [];
        for (const actId of activity_ids) {
          for (const uId of user_ids) {
            activityUserRecords.push({ id_activity: actId, id_user: uId });
          }
        }
        await prisma.activity_users.createMany({
          data: activityUserRecords,
          skipDuplicates: true
        });
      }
    }

    const created = await prisma.routes.findUnique({
      where: { id: route.id },
      include: {
        location: true,
        period: true,
        routeUsers: { include: { user: true } },
        activities: { include: { activityUsers: { include: { user: true } } } }
      }
    });

    res.status(201).json({ message: 'Ruta creada exitosamente.', route: created });
  } catch (err: any) {
    console.error('[CreateRoute ERROR]', err);
    res.status(500).json({ message: err.message || 'Error al crear la ruta.' });
  }
});

adminRoutes.put('/routes/:id', async (req: any, res: any) => {
  try {
    const { nombre, id_sede, id_period, fec_visita, activity_ids, user_ids } = req.body;
    const routeId = req.params.id;

    const primaryUserId = Array.isArray(user_ids) && user_ids.length > 0 ? user_ids[0] : null;

    const route = await prisma.routes.update({
      where: { id: routeId },
      data: {
        ...(nombre ? { nombre } : {}),
        ...(id_sede ? { id_sede } : {}),
        ...(id_period ? { id_period } : {}),
        ...(primaryUserId ? { id_user: primaryUserId } : {}),
        ...(fec_visita ? { fec_visita: new Date(fec_visita) } : {})
      }
    });

    if (Array.isArray(user_ids)) {
      await prisma.route_users.deleteMany({ where: { id_route: routeId } });
      await prisma.route_users.createMany({
        data: user_ids.map((uid: string) => ({ id_route: routeId, id_user: uid })),
        skipDuplicates: true
      });
    }

    if (Array.isArray(activity_ids)) {
      await prisma.activities.updateMany({
        where: { id_route: routeId, id: { notIn: activity_ids } },
        data: { id_route: null }
      });

      await prisma.activities.updateMany({
        where: { id: { in: activity_ids } },
        data: {
          id_route: routeId,
          ...(primaryUserId ? { id_user: primaryUserId } : {})
        }
      });

      if (Array.isArray(user_ids) && user_ids.length > 0) {
        const activityUserRecords: any[] = [];
        for (const actId of activity_ids) {
          for (const uId of user_ids) {
            activityUserRecords.push({ id_activity: actId, id_user: uId });
          }
        }
        await prisma.activity_users.createMany({
          data: activityUserRecords,
          skipDuplicates: true
        });
      }
    }

    const updated = await prisma.routes.findUnique({
      where: { id: routeId },
      include: {
        location: true,
        period: true,
        routeUsers: { include: { user: true } },
        activities: { include: { activityUsers: { include: { user: true } } } }
      }
    });

    res.json({ message: 'Ruta actualizada exitosamente.', route: updated });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error al actualizar la ruta.' });
  }
});

adminRoutes.delete('/routes/:id', async (req, res) => {
  await prisma.routes.delete({ where: { id: req.params.id } });
  res.json({ message: 'Ruta eliminada exitosamente.' });
});

adminRoutes.post('/activities', async (req, res) => {
  const { id_period, id_location, id_user, id_users, actividad, detalle, estado } = req.body;

  if (!id_period || !id_location || !actividad || !detalle) {
    return res.status(400).json({ message: 'id_period, id_location, actividad y detalle son requeridos.' });
  }

  const userIds: string[] = Array.isArray(id_users) && id_users.length > 0
    ? id_users
    : (id_user ? [id_user] : []);

  const primaryUserId = userIds.length > 0 ? userIds[0] : null;

  const activity = await prisma.activities.create({
    data: {
      id_period,
      id_location,
      id_user: primaryUserId,
      actividad,
      detalle,
      estado: estado || 'pendiente'
    },
    include: { period: true, location: true, user: true },
  });

  if (userIds.length > 0) {
    await prisma.activity_users.createMany({
      data: userIds.map((uid) => ({
        id_activity: activity.id,
        id_user: uid,
      })),
      skipDuplicates: true,
    });
  }

  res.status(201).json({ message: 'Actividad creada exitosamente.', activity });
});

adminRoutes.put('/activities/:id', async (req, res) => {
  const activity = await prisma.activities.update({
    where: { id: req.params.id },
    data: req.body,
    include: { period: true, location: true, user: true },
  });
  res.json({ message: 'Actividad actualizada exitosamente.', activity });
});

adminRoutes.delete('/activities/:id', async (req, res) => {
  await prisma.activities.delete({ where: { id: req.params.id } });
  res.json({ message: 'Actividad eliminada exitosamente.' });
});

adminRoutes.post('/periods', async (req: any, res: any) => {
  try {
    const { nombre, fec_inicio, fec_fin } = req.body;
    if (!nombre || !fec_inicio || !fec_fin) {
      return res.status(400).json({ message: 'nombre, fec_inicio y fec_fin son requeridos.' });
    }

    const period = await prisma.periods.create({
      data: {
        nombre,
        fec_inicio: new Date(fec_inicio),
        fec_fin: new Date(fec_fin)
      }
    });

    res.status(201).json({ message: 'Período creado exitosamente.', period });
  } catch (err: any) {
    console.error('[CreatePeriod ERROR]', err);
    res.status(500).json({ message: err.message || 'Error al crear el período.' });
  }
});

protectedRoutes.use(adminRoutes);
app.use('/api', protectedRoutes);


const runAutoSeed = async () => {
  let retries = 10;
  while (retries > 0) {
    try {
      // 1. Verificar si las tablas existen; de lo contrario crearlas con prisma db push
      try {
        await prisma.users.count();
      } catch (tableErr: any) {
        console.log('=================================');
        console.log('Tablas no encontradas en DB. Creando estructura con npx prisma db push...');
        await new Promise((resolve) => {
          const pushProc = spawn('npx', ['prisma', 'db', 'push', '--accept-data-loss'], { stdio: 'inherit', shell: true });
          pushProc.on('close', resolve);
        });
      }

      // 2. Si la DB no tiene usuarios, ejecutar el seed
      const count = await prisma.users.count();
      if (count === 0) {
        console.log('=================================');
        console.log('Base de datos vacía. Ejecutando seeders (seed.ts) automáticamente...');
        await new Promise((resolve) => {
          const seedProcess = spawn('npx', ['tsx', 'prisma/seed.ts'], { stdio: 'inherit', shell: true });
          seedProcess.on('close', resolve);
        });
      } else {
        console.log(`Base de datos lista. Hay ${count} usuarios registrados.`);
      }

      // 3. Vincular actividad a390a2d6 al usuario 74c85de6 si existen
      try {
        const targetAct = await prisma.activities.findUnique({ where: { id: 'a390a2d6-cc21-4b52-9507-4e9aa2d529cf' } });
        if (targetAct && targetAct.id_user !== '74c85de6-2476-4dfa-815d-3a6388eca9f4') {
          await prisma.activities.update({
            where: { id: 'a390a2d6-cc21-4b52-9507-4e9aa2d529cf' },
            data: { id_user: '74c85de6-2476-4dfa-815d-3a6388eca9f4' }
          });
          console.log('[AutoFix] Actividad a390a2d6 asignada correctamente al usuario 74c85de6.');
        }
      } catch (_fixErr) { }

      return; // Éxito, salimos del bucle
    } catch (err) {
      console.log(`Base de datos aún no lista. Esperando 3 segundos... (Reintentos: ${retries - 1})`);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  console.error('No se pudo conectar a la base de datos para el seed automático después de múltiples intentos.');
};

runAutoSeed().then(() => {
  // Scan for saved admin sessions and auto-connect them.
  try {
    const authDir = require('path').join(process.cwd(), 'baileys_auth');
    const { existsSync, readdirSync } = require('fs');
    if (existsSync(authDir)) {
      const dirs = readdirSync(authDir);
      let sessionsFound = 0;
      for (const dirName of dirs) {
        if (dirName.startsWith('auth_admin_')) {
          const adminId = dirName.replace('auth_admin_', '');
          console.log(`[WhatsApp] Sesión guardada para admin ${adminId} detectada. Reconectando...`);
          initWhatsApp(adminId).catch(() => {});
          sessionsFound++;
        }
      }
      if (sessionsFound === 0) {
        console.log('[WhatsApp] Sin sesiones guardadas. Esperando que los administradores se conecten.');
      }
    } else {
      console.log('[WhatsApp] Directorio de autenticación no existe. Esperando conexiones de administradores.');
    }
  } catch (err) {
    console.error('[WhatsApp] Error reconectando sesiones guardadas:', err);
  }

  // Sincronización automática de la base de datos desde update.xlsx al iniciar
  updateDatabaseFromExcel().catch((err) => {
    console.error('[ExcelUpdater] Error en sincronización inicial:', err);
  });

  startInactivityEngine();
  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Express server running with WebSockets on http://0.0.0.0:${PORT}`);
  });
});
