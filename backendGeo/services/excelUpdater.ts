import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prismaClient';

export async function updateDatabaseFromExcel(): Promise<{ updated: number; skipped: number; errors: number }> {
  const candidatePaths = [
    path.join(__dirname, '../src/update.xlsx'),
    path.join(__dirname, '../update.xlsx'),
    path.join(process.cwd(), 'src/update.xlsx'),
    path.join(process.cwd(), 'update.xlsx'),
  ];

  const filePath = candidatePaths.find(p => fs.existsSync(p));

  if (!filePath) {
    console.log('[ExcelUpdater] Archivo update.xlsx no encontrado en el entorno. Omitiendo sincronización inicial.');
    return { updated: 0, skipped: 0, errors: 0 };
  }

  console.log(`[ExcelUpdater] Iniciando sincronización desde ${filePath}...`);
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      console.log('[ExcelUpdater] No se encontraron hojas en update.xlsx. Omitiendo.');
      return { updated: 0, skipped: 0, errors: 0 };
    }
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

  console.log(`[ExcelUpdater] ${rows.length} registros encontrados en Excel.`);

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
        skippedCount++;
        continue;
      }

      // 2. Actualizar telefono en supervisores
      if (item.telefono) {
        await prisma.supervisors.update({
          where: { id: supervisor.id },
          data: { telefono: item.telefono }
        }).catch(() => {});
      }

      // 3. Actualizar sede_reg en sedes (locations)
      if (item.sede_reg) {
        if (supervisor.id_location) {
          await prisma.locations.update({
            where: { id: supervisor.id_location },
            data: { sede_reg: item.sede_reg }
          });
        } else {
          let location = await prisma.locations.findFirst({
            where: { sede_reg: item.sede_reg }
          });

          if (!location) {
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
          }

          await prisma.supervisors.update({
            where: { id: supervisor.id },
            data: { id_location: location.id }
          });
        }
      }

      // 4. Actualizar correo en usuarios
      if (item.correo) {
        const user = await prisma.users.findFirst({
          where: { id_supervisor: supervisor.id }
        });

        if (user) {
          await prisma.users.update({
            where: { id: user.id },
            data: { correo: item.correo }
          }).catch(() => {});
        }
      }

      updatedCount++;
    } catch (err: any) {
      console.error(`[ExcelUpdater] Error en doc "${item.doc}":`, err.message);
      errorCount++;
    }
  }

    console.log(`[ExcelUpdater] Finalizado. Actualizados: ${updatedCount}, Omitidos: ${skippedCount}, Errores: ${errorCount}`);
    return { updated: updatedCount, skipped: skippedCount, errors: errorCount };
  } catch (err: any) {
    console.error('[ExcelUpdater] Error al procesar update.xlsx:', err.message);
    return { updated: updatedCount, skipped: skippedCount, errors: errorCount };
  }
}
