import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Iniciando seed de base de datos...');

  // 1. Ubieties
  const ubiety1 = await prisma.ubieties.create({
    data: { latitud: -12.046374, longitud: -77.042793 }
  });
  const ubiety2 = await prisma.ubieties.create({
    data: { latitud: -12.098485, longitud: -77.035415 }
  });

  // 2. Locations
  const location1 = await prisma.locations.create({
    data: { sede_reg: 'Lima', sede_juris: 'Centro', nombre: 'Sede Principal', id_ubiety: ubiety1.id }
  });
  const location2 = await prisma.locations.create({
    data: { sede_reg: 'Lima', sede_juris: 'Sur', nombre: 'Sede Sur', id_ubiety: ubiety2.id }
  });

  // 3. Periods
  const period = await prisma.periods.create({
    data: { nombre: 'Periodo 2026-II', fec_inicio: new Date('2026-07-01'), fec_fin: new Date('2026-12-31') }
  });

  // 4. Activities
  const activity1 = await prisma.activities.create({
    data: { id_period: period.id, id_location: location1.id, actividad: 'Inspección Rutinaria', detalle: 'Revisión de protocolos de seguridad en sede central.' }
  });
  const activity2 = await prisma.activities.create({
    data: { id_period: period.id, id_location: location2.id, actividad: 'Mantenimiento Preventivo', detalle: 'Limpieza y mantenimiento de servidores.' }
  });

  // 5. Schedules (Turnos)
  const schedule1 = await prisma.schedules.create({
    data: { tipo: 'Mañana', ingreso: new Date('1970-01-01T08:00:00Z'), salida: new Date('1970-01-01T16:00:00Z') }
  });

  // 6. Supervisors
  const supervisorAdmin = await prisma.supervisors.create({
    data: {
      nombres: 'Admin', ape_pat: 'Enla', ape_mat: 'Geo', doc: '00000001',
      nacionalidad: 'Peruano', genero: 'M', telefono: '999999999', direccion: 'Av. Principal 123',
      id_location: location1.id, id_activity: activity1.id, id_ubiety: ubiety1.id, id_turno: schedule1.id
    }
  });

  const supervisorUser = await prisma.supervisors.create({
    data: {
      nombres: 'Usuario', ape_pat: 'Prueba', ape_mat: 'Geo', doc: '00000002',
      nacionalidad: 'Peruano', genero: 'F', telefono: '988888888', direccion: 'Av. Secundaria 456',
      id_location: location2.id, id_activity: activity2.id, id_ubiety: ubiety2.id, id_turno: schedule1.id
    }
  });

  // 7. Users
  const hashedPassword = bcrypt.hashSync('password123', 10);
  
  const adminUser = await prisma.users.create({
    data: {
      id_supervisor: supervisorAdmin.id,
      username: 'admin',
      correo: 'admin@enlageo.com',
      clave: hashedPassword,
      rol: 'admin',
      estado: 'activo'
    }
  });

  const regularUser = await prisma.users.create({
    data: {
      id_supervisor: supervisorUser.id,
      username: 'usuario',
      correo: 'usuario@enlageo.com',
      clave: hashedPassword,
      rol: 'usuario',
      estado: 'activo'
    }
  });

  // Relacionar usuario a actividades
  await prisma.activities.update({ where: { id: activity1.id }, data: { id_user: regularUser.id } });
  await prisma.activities.update({ where: { id: activity2.id }, data: { id_user: regularUser.id } });

  // 8. Routes
  await prisma.routes.create({
    data: {
      nombre: 'Ruta Sur', id_user: regularUser.id, id_sede: location2.id,
      fec_visita: new Date('2026-07-25'), id_period: period.id, estado: 'pendiente', fec_asignado: new Date()
    }
  });

  // 9. Trackings de prueba
  await prisma.trackings.create({
    data: {
      id_user: regularUser.id, id_activity: activity1.id, lat: -12.046374, lng: -77.042793,
      accuracy: 10.5, speed: 1.2, battery_level: 85, recorded_at: new Date()
    }
  });

  console.log('Seed completado exitosamente.');
  console.log('=================================');
  console.log('Usuarios creados:');
  console.log(`1. Admin   -> correo: admin@enlageo.com   | clave: password123`);
  console.log(`2. Usuario -> correo: usuario@enlageo.com | clave: password123`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
