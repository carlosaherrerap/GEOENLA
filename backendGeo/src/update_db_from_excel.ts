import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Crear pool con SSL habilitado para Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function runUpdate() {
  console.log('=== INICIANDO ACTUALIZACION DE BASE DE DATOS DESDE EXCEL ===');
  console.log('DATABASE_URL cargada:', process.env.DATABASE_URL ? 'SI' : 'NO');

  const filePath = path.join(__dirname, 'update.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const rows: { doc: string; sede_reg: string; telefono: string; correo: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = row.values as any[];
    const rawDoc = values[1];
    const rawSede = values[2];
    const rawTel = values[3];
    const rawCorreo = values[4];

    if (!rawDoc) return;

    let docStr = String(typeof rawDoc === 'object' && 'text' in rawDoc ? rawDoc.text : rawDoc).trim();
    if (/^\d+$/.test(docStr) && docStr.length < 8) {
      docStr = docStr.padStart(8, '0');
    }

    const sede_reg = rawSede ? String(typeof rawSede === 'object' && 'text' in rawSede ? rawSede.text : rawSede).trim() : '';
    const telefono = rawTel ? String(typeof rawTel === 'object' && 'text' in rawTel ? rawTel.text : rawTel).trim() : '';
    const correo = rawCorreo ? String(typeof rawCorreo === 'object' && 'text' in rawCorreo ? rawCorreo.text : rawCorreo).trim() : '';

    rows.push({ doc: docStr, sede_reg, telefono, correo });
  });

  console.log(`Se encontraron ${rows.length} registros en el archivo Excel.\n`);

  // Verificar conexion
  try {
    const testCount = await prisma.supervisors.count();
    console.log(`[DB] Conexion exitosa. Total supervisores en DB: ${testCount}\n`);
  } catch (connErr: any) {
    console.error('[DB] ERROR DE CONEXION:', connErr.message);
    return;
  }

  for (const item of rows) {
    try {
      // 1. Buscar supervisor por doc
      let supervisor = await prisma.supervisors.findFirst({
        where: { doc: item.doc }
      });

      if (!supervisor && /^\d+$/.test(item.doc)) {
        const altDoc = item.doc.replace(/^0+/, '');
        supervisor = await prisma.supervisors.findFirst({
          where: { doc: altDoc }
        });
      }

      if (!supervisor) {
        console.warn(`  [OMITIDO] No existe supervisor con doc="${item.doc}"`);
        skippedCount++;
        continue;
      }

      console.log(`  Procesando supervisor doc="${item.doc}" (id=${supervisor.id})...`);

      // 2. Actualizar TELEFONO en tabla supervisores
      if (item.telefono) {
        await prisma.supervisors.update({
          where: { id: supervisor.id },
          data: { telefono: item.telefono }
        });
        console.log(`    -> telefono actualizado: "${item.telefono}"`);
      }

      // 3. Actualizar SEDE_REG en tabla sedes (locations)
      if (item.sede_reg) {
        if (supervisor.id_location) {
          // Actualizar la sede existente del supervisor
          await prisma.locations.update({
            where: { id: supervisor.id_location },
            data: { sede_reg: item.sede_reg }
          });
          console.log(`    -> sede_reg actualizada en sede existente (id_location=${supervisor.id_location}): "${item.sede_reg}"`);
        } else {
          // Buscar si ya existe una sede con esa sede_reg
          let location = await prisma.locations.findFirst({
            where: { sede_reg: item.sede_reg }
          });

          if (!location) {
            // Crear nueva sede. Necesitamos un id_ubiety
            let ubi = await prisma.ubieties.findFirst();
            if (!ubi) {
              ubi = await prisma.ubieties.create({
                data: { latitud: 0, longitud: 0 }
              });
            }
            location = await prisma.locations.create({
              data: {
                sede_reg: item.sede_reg,
                sede_juris: item.sede_reg,
                nombre: `Sede ${item.sede_reg}`,
                id_ubiety: ubi.id
              }
            });
            console.log(`    -> NUEVA sede creada: "${item.sede_reg}" (id=${location.id})`);
          } else {
            console.log(`    -> sede encontrada: "${item.sede_reg}" (id=${location.id})`);
          }

          // Asignar la sede al supervisor (actualizar el NULL de id_location)
          await prisma.supervisors.update({
            where: { id: supervisor.id },
            data: { id_location: location.id }
          });
          console.log(`    -> id_location del supervisor actualizado: ${location.id}`);
        }
      }

      // 4. Actualizar CORREO en tabla usuarios (users)
      //    Buscar usuario donde id_supervisor = supervisor.id
      if (item.correo) {
        const user = await prisma.users.findFirst({
          where: { id_supervisor: supervisor.id }
        });

        if (user) {
          await prisma.users.update({
            where: { id: user.id },
            data: { correo: item.correo }
          });
          console.log(`    -> correo actualizado en usuario (id=${user.id}): "${item.correo}"`);
        } else {
          console.log(`    -> SIN USUARIO vinculado a este supervisor, correo no actualizado`);
        }
      }

      updatedCount++;
      console.log(`  [OK] Supervisor doc="${item.doc}" actualizado.\n`);

    } catch (err: any) {
      console.error(`  [ERROR] doc="${item.doc}": ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n=== RESUMEN DE PROCESAMIENTO ===');
  console.log(`Total registros en Excel: ${rows.length}`);
  console.log(`Actualizados con exito:   ${updatedCount}`);
  console.log(`Omitidos (no encontrados): ${skippedCount}`);
  console.log(`Errores:                   ${errorCount}`);
}

runUpdate().catch(console.error).finally(() => prisma.$disconnect());
