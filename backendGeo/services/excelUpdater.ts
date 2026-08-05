import ExcelJS from 'exceljs';
import path from 'path';
import { prisma } from '../prismaClient';

export async function updateDatabaseFromExcel(): Promise<{ updated: number; skipped: number; errors: number }> {
  console.log('[ExcelUpdater] Iniciando sincronización de sedes, supervisores y usuarios desde update.xlsx...');
  const filePath = path.join(__dirname, '../src/update.xlsx');

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

    let docStr = String(rawDoc).trim();
    if (typeof rawDoc === 'number' || (docStr.length > 0 && docStr.length < 8 && /^\d+$/.test(docStr))) {
      docStr = docStr.padStart(8, '0');
    }

    const sede_reg = rawSede ? String(rawSede).trim() : '';
    const telefono = rawTel ? String(rawTel).trim() : '';
    const correo = rawCorreo ? String(rawCorreo).trim() : '';

    rows.push({ doc: docStr, sede_reg, telefono, correo });
  });

  for (const item of rows) {
    try {
      let supervisor = await prisma.supervisors.findFirst({
        where: { doc: item.doc },
        include: { location: true, users: true }
      });

      if (!supervisor && /^\d+$/.test(item.doc)) {
        const altDoc = item.doc.replace(/^0+/, '');
        supervisor = await prisma.supervisors.findFirst({
          where: { doc: altDoc },
          include: { location: true, users: true }
        });
      }

      if (!supervisor) {
        console.warn(`[ExcelUpdater] Omitido: No se encontró supervisor con DNI/DOC "${item.doc}"`);
        skippedCount++;
        continue;
      }

      // 1. Actualizar teléfono en tabla supervisores
      if (item.telefono) {
        await prisma.supervisors.update({
          where: { id: supervisor.id },
          data: { telefono: item.telefono }
        }).catch((e) => console.warn(`[ExcelUpdater] Advertencia en teléfono para DNI ${item.doc}:`, e.message));
      }

      // 2. Actualizar sede_reg en la tabla sedes (locations)
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

      // 3. Actualizar correo en la tabla usuarios (users)
      if (item.correo && supervisor.users && supervisor.users.length > 0) {
        for (const user of supervisor.users) {
          await prisma.users.update({
            where: { id: user.id },
            data: { correo: item.correo }
          }).catch((e) => console.warn(`[ExcelUpdater] Advertencia en correo para usuario DNI ${item.doc}:`, e.message));
        }
      }

      updatedCount++;
    } catch (err: any) {
      console.error(`[ExcelUpdater] Error procesando DNI "${item.doc}":`, err.message);
      errorCount++;
    }
  }

  console.log(`[ExcelUpdater] Finalizado. Actualizados: ${updatedCount}, Omitidos: ${skippedCount}, Errores: ${errorCount}`);
  return { updated: updatedCount, skipped: skippedCount, errors: errorCount };
}
