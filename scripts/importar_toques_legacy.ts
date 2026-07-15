// T14: importa la seccion "## Toques" del export por-pagina de Notion como toques
// legacy, enriqueciendo el placeholder que sembro el baseline (2026-06-30, un solo
// "hubo llamada" generico por empresa) con la narrativa real y, cuando hubo reunion
// grabada, el link a tl;dv. Universo chico: solo las empresas cuya pagina .md trae
// "## Toques" (7 en el export de hoy).
//
// Idempotente: si la empresa ya tiene algun toque fuente='notion_toques' se salta
// entera (empresaYaTieneToquesNotionImportados). Match empresa Notion <-> empresa DB
// identico al resto de scripts de esta fase: notion_page_id primero, fallback por
// nombre exacto normalizado.
//
// Correr: node --experimental-strip-types --experimental-loader
//   ./scripts/resolve-ts-ext.mjs scripts/importar_toques_legacy.ts

import { db, schema } from '../app/db/index.ts';
import {
  empresaYaTieneToquesNotionImportados,
  toquesExistentesParaImportarLegacy,
  aplicarImportacionToquesLegacy,
} from '../app/db/repository.ts';
import { crearNotionExportAdapter } from '../app/adapters/notion/notionExportAdapter.ts';
import { planificarImportacionToques } from '../app/core/reconciliacion/toquesNotion.ts';
import { normalizarRazonSocial } from '../app/core/reconciliacion/normalizarRazonSocial.ts';

const DIR_EXPORT_NOTION = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline';
const CSV_PATH = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline f5e2be53a1514d42ac6db30fd7c5202a_all.csv';
const ID_ORGANIZACION = 1;

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

// notion_page_id en la DB real viene en dos formatos (encontrado corriendo esta
// importacion): con guiones (uuid, del enlace por MCP de 2026-07-14) y sin guiones
// (32 hex, de scripts/enlazar_page_ids.ts T5 -- mismo formato que entrega el adapter
// desde el nombre de archivo). Mismo id, bytes distintos: sin normalizar, el match
// fallaba para cualquier empresa enlazada por la via con guiones (Punto Red, ERC
// Explorer). Solo local a este script -- el resto de scripts de esta fase tiene el
// mismo problema latente, pendiente de arreglar aparte (no se toca aqui).
function sinGuiones(pageId: string): string {
  return pageId.replace(/-/g, '').toLowerCase();
}

function main() {
  const empresasDb = leerEmpresasDb();
  const activas = empresasDb.filter((e) => !e.operaBajoId);

  const porPageId = new Map<string, EmpresaDb>();
  const porNombreNormalizado = new Map<string, EmpresaDb[]>();
  for (const e of activas) {
    if (e.notionPageId) porPageId.set(sinGuiones(e.notionPageId), e);
    const key = normalizarRazonSocial(e.nombreOficial);
    if (!porNombreNormalizado.has(key)) porNombreNormalizado.set(key, []);
    porNombreNormalizado.get(key)!.push(e);
  }

  const empresasNotion = crearNotionExportAdapter(DIR_EXPORT_NOTION, CSV_PATH).leerEmpresas()
    .filter((e) => e.toques.length > 0);

  console.log(`empresas Notion con seccion "## Toques": ${empresasNotion.length}`);

  let importadas = 0;
  let yaImportadas = 0;
  let toquesEscritos = 0;
  const sinMatchDb: string[] = [];
  const ambiguos: string[] = [];

  for (const notionEmpresa of empresasNotion) {
    let empresaDb: EmpresaDb | undefined;
    if (notionEmpresa.pageId) {
      empresaDb = porPageId.get(sinGuiones(notionEmpresa.pageId));
    }
    if (!empresaDb) {
      const key = normalizarRazonSocial(notionEmpresa.nombre);
      const candidatos = porNombreNormalizado.get(key);
      if (!candidatos || candidatos.length === 0) {
        sinMatchDb.push(notionEmpresa.nombre);
        continue;
      }
      if (candidatos.length > 1) {
        ambiguos.push(`${notionEmpresa.nombre} -> [${candidatos.map((c) => c.idEmpresa).join(', ')}]`);
        continue;
      }
      empresaDb = candidatos[0];
    }

    if (empresaYaTieneToquesNotionImportados(empresaDb.idEmpresa)) {
      yaImportadas++;
      continue;
    }

    const existentes = toquesExistentesParaImportarLegacy(empresaDb.idEmpresa);
    const plan = planificarImportacionToques(existentes, notionEmpresa.toques);
    aplicarImportacionToquesLegacy(empresaDb.idEmpresa, ID_ORGANIZACION, plan);

    importadas++;
    toquesEscritos += plan.length;
    console.log(`  ${notionEmpresa.nombre} (${empresaDb.idEmpresa}): ${plan.length} toque(s), ${plan.filter((a) => a.accion === 'actualizar').length} actualizado(s), ${plan.filter((a) => a.accion === 'insertar').length} nuevo(s)`);
  }

  console.log(`empresas importadas en esta corrida: ${importadas}`);
  console.log(`toques escritos (actualizados + insertados): ${toquesEscritos}`);
  console.log(`empresas ya importadas antes (no-op, idempotente): ${yaImportadas}`);
  console.log(`empresas Notion sin match en la DB: ${sinMatchDb.length}`);
  if (sinMatchDb.length > 0) console.log('  ' + sinMatchDb.join('\n  '));
  console.log(`empresas Notion con match ambiguo: ${ambiguos.length}`);
  if (ambiguos.length > 0) console.log('  ' + ambiguos.join('\n  '));
}

main();
