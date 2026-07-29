import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';
import { uploadToR2 } from './r2Service';
import { setLatestUserLocation, getLatestUserLocations } from './redisClient';

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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

app.use(cors());
app.use(express.json());

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

protectedRoutes.post('/logout', (req, res) => {
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

    if (!locationObj || !locationObj.ubiety) {
      const activityObj = await prisma.activities.findUnique({ where: { id: id_activity }, include: { location: { include: { ubiety: true } } } });
      if (activityObj && activityObj.location && activityObj.location.ubiety) {
        targetLocationId = activityObj.location.id;
        locationObj = activityObj.location;
      }
    }

    const sedeLat = locationObj?.ubiety?.latitud ? Number(locationObj.ubiety.latitud) : Number(lat || -12.0464);
    const sedeLng = locationObj?.ubiety?.longitud ? Number(locationObj.ubiety.longitud) : Number(lng || -77.0428);
    const currentLat = Number(lat || sedeLat);
    const currentLng = Number(lng || sedeLng);
    const distance = haversineDistance(currentLat, currentLng, sedeLat, sedeLng);

    if (distance > 25.0) {
      return res.status(422).json({
        message: `Te encuentras a ${distance.toFixed(1)}m. Debes estar a 25 metros o menos de la sede para marcar asistencia.`,
        distance_m: Number(distance.toFixed(2)),
        sede_coords: { lat: sedeLat, lng: sedeLng },
      });
    }

    const newStatus = is_final || is_final === 'true' ? 'completado' : 'asistencia_marcada';

    // Subir fotos a Cloudflare R2 si vienen en base64
    const rawPhotos = Array.isArray(photos) ? photos : typeof photos === 'string' ? [photos] : [];
    const uploadedPhotoUrls: string[] = [];

    for (let i = 0; i < rawPhotos.length; i++) {
      const item = rawPhotos[i];
      if (item && (item.startsWith('data:image') || item.length > 500)) {
        try {
          const r2Url = await uploadToR2(item, `attendance_${req.user.id}_${i}.jpg`);
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
        id_location: targetLocationId || 'loc_default',
        lat: currentLat,
        lng: currentLng,
        distance_m: Number(distance.toFixed(2)),
        photos: uploadedPhotoUrls,
        observacion: observacion || 'Asistencia marcada desde la app.',
        checked_in_at: new Date(),
        estado: newStatus,
      },
    });

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

  const attendances = await prisma.attendances.findMany({
    where,
    include: { activity: true, location: true },
    orderBy: { checked_in_at: 'desc' },
    take: 20,
  });
  res.json({ data: attendances });
});

// Trackings
protectedRoutes.post('/trackings', async (req: any, res) => {
  const { id_activity, lat, lng, accuracy, speed, battery_level, recorded_at } = req.body;
  const recordedDate = recorded_at ? new Date(recorded_at) : new Date();

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
    update: { last_seen_at: new Date() },
    create: { id_user: req.user.id, last_seen_at: new Date() },
  }).catch(() => {});

  res.status(201).json({
    message: 'Punto registrado.',
    tracking: { ...tracking, id: tracking.id.toString() },
  });
});

protectedRoutes.post('/trackings/bulk', async (req: any, res) => {
  const { points } = req.body;
  if (!points || !Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ message: 'No hay puntos para registrar.' });
  }

  const mappedPoints = points.map((p: any) => ({
    id_user: req.user.id,
    id_activity: p.id_activity || null,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    speed: p.speed,
    battery_level: p.battery_level,
    recorded_at: new Date(p.recorded_at),
    is_synced: false,
  }));

  await prisma.trackings.createMany({ data: mappedPoints });

  // Update Redis with the most recent point in the batch
  const lastPoint = mappedPoints[mappedPoints.length - 1];
  await setLatestUserLocation(req.user.id, {
    lat: Number(lastPoint.lat),
    lng: Number(lastPoint.lng),
    accuracy: lastPoint.accuracy ? Number(lastPoint.accuracy) : null,
    speed: lastPoint.speed ? Number(lastPoint.speed) : null,
    battery_level: lastPoint.battery_level ? Number(lastPoint.battery_level) : null,
    id_activity: lastPoint.id_activity || null,
    recorded_at: lastPoint.recorded_at.toISOString(),
  });

  res.status(201).json({ message: `${mappedPoints.length} puntos sincronizados.`, count: mappedPoints.length });
});

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
// Pedestrian Map Matching Endpoint using OSRM to snap raw GPS points onto sidewalks and streets
protectedRoutes.get('/routes/osrm-match', async (req: any, res) => {
  const { coordinates } = req.query; // format: "lng1,lat1;lng2,lat2;lng3,lat3"
  if (!coordinates || typeof coordinates !== 'string') {
    return res.status(400).json({ message: 'Parámetro coordinates requerido (lng1,lat1;lng2,lat2).' });
  }

  const osrmBaseUrl = process.env.OSRM_URL || 'https://router.project-osrm.org';
  const osrmUrl = `${osrmBaseUrl}/match/v1/foot/${coordinates}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(osrmUrl);
    if (!response.ok) {
      if (osrmBaseUrl !== 'https://router.project-osrm.org') {
        const publicUrl = `https://router.project-osrm.org/match/v1/foot/${coordinates}?overview=full&geometries=geojson`;
        const pubResponse = await fetch(publicUrl);
        const pubData = await pubResponse.json();
        return res.json(pubData);
      }
      throw new Error(`OSRM Match response status ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('[OSRM Match Error]', error.message);
    res.status(500).json({ message: 'Error procesando map matching peatonal.', error: error.message });
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
      select: {
        id: true,
        username: true,
        correo: true,
        rol: true,
        estado: true,
        created_at: true,
      },
      orderBy: { username: 'asc' },
    });
    res.json({ data: users });
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
        user1: { select: { id: true, username: true, correo: true, rol: true, estado: true } },
        user2: { select: { id: true, username: true, correo: true, rol: true, estado: true } },
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
  const users = await prisma.users.findMany({
    include: { supervisor: { include: { location: true, schedule: true, ubiety: true } }, deviceDetail: true },
    orderBy: { created_at: 'desc' },
    take: 50,
  });
  res.json({ data: users });
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
  const { id_period, id_location, id_user, actividad, detalle, estado } = req.body;

  if (!id_period || !id_location || !actividad || !detalle) {
    return res.status(400).json({ message: 'id_period, id_location, actividad y detalle son requeridos.' });
  }

  const activity = await prisma.activities.create({
    data: {
      id_period,
      id_location,
      id_user: id_user || null,
      actividad,
      detalle,
      estado: estado || 'pendiente'
    },
    include: { period: true, location: true, user: true },
  });
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
      } catch (_fixErr) {}

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
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Express server running on http://0.0.0.0:${PORT}`);
  });
});
