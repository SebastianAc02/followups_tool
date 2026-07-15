// T5: enlaza notion_page_id en la DB para las empresas Notion ya deduplicadas
// (Fase 0, T3/T4 corridos). Match por nombre exacto normalizado -- la fusion de
// gemelos (sintetico <-> NIT) ya paso en Fase 0, asi que aca no hace falta fuzzy:
// alcanza con encontrar el nombre_oficial que Notion ya dejo en la empresa
// sobreviviente. Filas con opera_bajo_id (absorbidas) se saltan: su identidad ya
// la tiene el sobreviviente, que matchea por su propio nombre.
//
// Correr: node --experimental-strip-types --experimental-loader
//   ./scripts/resolve-ts-ext.mjs scripts/enlazar_page_ids.ts

import { db, schema } from '../app/db/index.ts';
import { enlazarPageId } from '../app/db/repository.ts';
import { crearNotionExportAdapter } from '../app/adapters/notion/notionExportAdapter.ts';
import { normalizarRazonSocial } from '../app/core/reconciliacion/normalizarRazonSocial.ts';
import { isNull } from 'drizzle-orm';

const DIR_EXPORT_NOTION = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline';
const CSV_PATH = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline f5e2be53a1514d42ac6db30fd7c5202a_all.csv';

interface EmpresaDb {
  idEmpresa: string;
  nombreOficial: string;
  notionPageId: string | null;
  operaBajoId: string | null;
}

function leerEmpresasDb(): EmpresaDb[] {
  return db.select({
    idEmpresa: schema.empresa.idEmpresa,
    nombreOficial: schema.empresa.nombreOficial,
    notionPageId: schema.empresa.notionPageId,
    operaBajoId: schema.empresa.operaBajoId,
  }).from(schema.empresa).all();
}

function main() {
  const empresasDb = leerEmpresasDb();
  const activas = empresasDb.filter((e) => !e.operaBajoId);

  const porNombreNormalizado = new Map<string, EmpresaDb[]>();
  for (const e of activas) {
    const key = normalizarRazonSocial(e.nombreOficial);
    if (!porNombreNormalizado.has(key)) porNombreNormalizado.set(key, []);
    porNombreNormalizado.get(key)!.push(e);
  }

  const empresasNotion = crearNotionExportAdapter(DIR_EXPORT_NOTION, CSV_PATH).leerEmpresas()
    .filter((e) => e.nombre.trim().length > 0 && e.pageId !== null);

  console.log(`empresas DB activas (sin fundir): ${activas.length}`);
  console.log(`empresas Notion con page_id: ${empresasNotion.length}`);

  let enlazadas = 0;
  let yaEnlazadasIgual = 0;
  const sinMatchDb: string[] = [];
  const ambiguos: string[] = [];

  for (const notionEmpresa of empresasNotion) {
    const key = normalizarRazonSocial(notionEmpresa.nombre);
    const candidatos = porNombreNormalizado.get(key);

    if (!candidatos || candidatos.length === 0) {
      sinMatchDb.push(notionEmpresa.nombre);
      continue;
    }
    if (candidatos.length > 1) {
      // Mas de una empresa activa con el mismo nombre normalizado: no se puede
      // decidir sin ambiguedad aca (deberia haberse resuelto en Fase 0). Se reporta
      // en vez de adivinar.
      ambiguos.push(`${notionEmpresa.nombre} -> [${candidatos.map((c) => c.idEmpresa).join(', ')}]`);
      continue;
    }

    const empresaDb = candidatos[0];
    if (empresaDb.notionPageId === notionEmpresa.pageId) {
      yaEnlazadasIgual++;
      continue;
    }

    enlazarPageId(empresaDb.idEmpresa, notionEmpresa.pageId!);
    enlazadas++;
  }

  console.log(`enlazadas en esta corrida: ${enlazadas}`);
  console.log(`ya tenian el mismo page_id (no-op): ${yaEnlazadasIgual}`);
  console.log(`empresas Notion sin match en la DB: ${sinMatchDb.length}`);
  if (sinMatchDb.length > 0) {
    console.log('  ' + sinMatchDb.join('\n  '));
  }
  console.log(`empresas Notion con match ambiguo (mas de una fila DB activa): ${ambiguos.length}`);
  if (ambiguos.length > 0) {
    console.log('  ' + ambiguos.join('\n  '));
  }
}

main();
