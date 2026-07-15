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
import { construirIndiceEmpresasDb, matchEmpresaNotion, type EmpresaDbMatch } from '../app/core/reconciliacion/matchNotion.ts';
const DIR_EXPORT_NOTION = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline';
const CSV_PATH = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline f5e2be53a1514d42ac6db30fd7c5202a_all.csv';

function leerEmpresasDb(): EmpresaDbMatch[] {
  return db.select({
    idEmpresa: schema.empresa.idEmpresa,
    nombreOficial: schema.empresa.nombreOficial,
    notionPageId: schema.empresa.notionPageId,
    operaBajoId: schema.empresa.operaBajoId,
  }).from(schema.empresa).all();
}

function leerAlias() {
  return db.select({ idEmpresa: schema.empresaAlias.idEmpresa, alias: schema.empresaAlias.alias }).from(schema.empresaAlias).all();
}

function main() {
  const empresasDb = leerEmpresasDb();
  const indice = construirIndiceEmpresasDb(empresasDb, leerAlias());

  const empresasNotion = crearNotionExportAdapter(DIR_EXPORT_NOTION, CSV_PATH).leerEmpresas()
    .filter((e) => e.nombre.trim().length > 0 && e.pageId !== null);

  console.log(`empresas DB activas (sin fundir): ${empresasDb.filter((e) => !e.operaBajoId).length}`);
  console.log(`empresas Notion con page_id: ${empresasNotion.length}`);

  let enlazadas = 0;
  let yaEnlazadasIgual = 0;
  const sinMatchDb: string[] = [];

  for (const notionEmpresa of empresasNotion) {
    // M (2026-07-15): el helper unico -- page_id como llave eterna, alias resuelto a
    // mano, y razon social solo si es unico candidato (ambiguo = null, nunca adivina).
    const empresaDb = matchEmpresaNotion(indice, { pageId: notionEmpresa.pageId, nombre: notionEmpresa.nombre });
    if (!empresaDb) {
      sinMatchDb.push(notionEmpresa.nombre);
      continue;
    }

    if (empresaDb.notionPageId === notionEmpresa.pageId) {
      yaEnlazadasIgual++;
      continue;
    }

    enlazarPageId(empresaDb.idEmpresa, notionEmpresa.pageId!);
    enlazadas++;
  }

  console.log(`enlazadas en esta corrida: ${enlazadas}`);
  console.log(`ya tenian el mismo page_id (no-op): ${yaEnlazadasIgual}`);
  console.log(`empresas Notion sin match en la DB (o ambiguo): ${sinMatchDb.length}`);
  if (sinMatchDb.length > 0) {
    console.log('  ' + sinMatchDb.join('\n  '));
  }
}

main();
