// T10: sincroniza estado_notion (etapa comercial) desde el export de Notion hacia
// la DB, por el camino auditado (actualizarEstadoNotion, que ya es idempotente y ya
// escribe empresa_estado_historial en la misma transaccion). Notion sobrescribe: si
// el export trae un valor, gana sobre lo que haya en la DB, sin excepciones (a
// diferencia de T12, que solo llena vacios). No se escribe la columna a pelo.
//
// Match primario: notion_page_id (T5 ya enlazo ~480 de 2017 empresas). Para filas de
// Notion sin match por page_id, fallback por nombre exacto normalizado (mismo
// criterio que enlazar_page_ids.ts). Lo que no matchea de ninguna forma se reporta,
// no se descarta en silencio. Filas con opera_bajo_id (absorbidas en Fase 0) se
// saltan: son identidades muertas, no reciben cambios de estado.
//
// Correr: node --experimental-strip-types --experimental-loader
//   ./scripts/resolve-ts-ext.mjs scripts/sync_estados_notion.ts

import { db, schema } from '../app/db/index.ts';
import { actualizarEstadoNotion } from '../app/db/repository.ts';
import { crearNotionExportAdapter } from '../app/adapters/notion/notionExportAdapter.ts';
import { mapearEstadoNotion } from '../app/core/reconciliacion/mapeoEstados.ts';

const DIR_EXPORT_NOTION = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline';
const CSV_PATH = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline f5e2be53a1514d42ac6db30fd7c5202a_all.csv';
const ID_ORGANIZACION = 1;

// Mismo criterio de normalizacion que enlazar_page_ids.ts (sufijos legales fuera,
// sin acentos, sin puntuacion) para no divergir en como dos scripts del mismo
// pipeline leen el mismo nombre.
const SUFIJOS_LEGALES = new Set([
  'sas', 'sa', 's', 'a', 'ltda', 'eu', 'esp', 'de', 'del', 'la', 'el', 'zomac', 'bic', 'y', 'e',
]);

function normalizar(nombre: string): string {
  const sinAcentos = nombre.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const soloAlfanumerico = sinAcentos.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return soloAlfanumerico
    .split(' ')
    .filter((t) => t.length > 0 && !SUFIJOS_LEGALES.has(t))
    .join(' ');
}

interface EmpresaDb {
  idEmpresa: string;
  nombreOficial: string;
  notionPageId: string | null;
  operaBajoId: string | null;
  estadoNotion: string | null;
}

function leerEmpresasDb(): EmpresaDb[] {
  return db.select({
    idEmpresa: schema.empresa.idEmpresa,
    nombreOficial: schema.empresa.nombreOficial,
    notionPageId: schema.empresa.notionPageId,
    operaBajoId: schema.empresa.operaBajoId,
    estadoNotion: schema.empresa.estadoNotion,
  }).from(schema.empresa).all();
}

function main() {
  const empresasDb = leerEmpresasDb();
  const activas = empresasDb.filter((e) => !e.operaBajoId);

  const porPageId = new Map<string, EmpresaDb>();
  const porNombreNormalizado = new Map<string, EmpresaDb[]>();
  for (const e of activas) {
    if (e.notionPageId) porPageId.set(e.notionPageId, e);
    const key = normalizar(e.nombreOficial);
    if (!porNombreNormalizado.has(key)) porNombreNormalizado.set(key, []);
    porNombreNormalizado.get(key)!.push(e);
  }

  const empresasNotion = crearNotionExportAdapter(DIR_EXPORT_NOTION, CSV_PATH).leerEmpresas()
    .filter((e) => e.nombre.trim().length > 0);

  console.log(`empresas DB activas (sin fundir): ${activas.length}`);
  console.log(`empresas Notion en el export: ${empresasNotion.length}`);

  const fecha = new Date().toISOString();

  let actualizadas = 0;
  let yaAlineadas = 0;
  let estadoVacio = 0;
  const sinMatchDb: string[] = [];
  const ambiguos: string[] = [];
  const estadoNoMapeado: string[] = [];

  // Primera pasada: resuelve match DB + estado mapeado por fila de Notion, sin
  // escribir todavia. Agrupado por idEmpresa destino: el CSV puede traer mas de una
  // fila con el mismo nombre resolviendo a la misma empresa (visto en la corrida
  // real: "ESSA" aparece dos veces, una "Oportunidad" y otra "Lead", porque el
  // adapter colapsa el pageId por nombre de archivo). Si eso pasa con estados
  // distintos, aplicar cualquiera de las dos vuelve el resultado dependiente del
  // orden de iteracion -- rompe idempotencia entre corridas. Se reporta como
  // ambiguo y no se escribe ninguna, igual que un match ambiguo del lado DB.
  interface Resuelta { notionEmpresa: (typeof empresasNotion)[number]; empresaDb: EmpresaDb; estadoMapeado: string }
  const porIdEmpresaDestino = new Map<string, Resuelta[]>();

  for (const notionEmpresa of empresasNotion) {
    if (notionEmpresa.estado.trim().length === 0) {
      estadoVacio++;
      continue;
    }

    let empresaDb: EmpresaDb | undefined;
    if (notionEmpresa.pageId) {
      empresaDb = porPageId.get(notionEmpresa.pageId);
    }
    if (!empresaDb) {
      const key = normalizar(notionEmpresa.nombre);
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

    let estadoMapeado;
    try {
      estadoMapeado = mapearEstadoNotion(notionEmpresa.estado);
    } catch {
      estadoNoMapeado.push(`${notionEmpresa.nombre}: "${notionEmpresa.estado}"`);
      continue;
    }

    if (!porIdEmpresaDestino.has(empresaDb.idEmpresa)) porIdEmpresaDestino.set(empresaDb.idEmpresa, []);
    porIdEmpresaDestino.get(empresaDb.idEmpresa)!.push({ notionEmpresa, empresaDb, estadoMapeado });
  }

  for (const [, resueltas] of porIdEmpresaDestino) {
    const estadosDistintos = new Set(resueltas.map((r) => r.estadoMapeado));
    if (estadosDistintos.size > 1) {
      const detalle = resueltas.map((r) => `${r.notionEmpresa.nombre}="${r.notionEmpresa.estado}"`).join(' vs ');
      ambiguos.push(`${resueltas[0].empresaDb.idEmpresa} <- filas Notion en conflicto: ${detalle}`);
      continue;
    }

    const { empresaDb, estadoMapeado } = resueltas[0];
    if (empresaDb.estadoNotion === estadoMapeado) {
      yaAlineadas++;
      continue;
    }

    actualizarEstadoNotion(empresaDb.idEmpresa, estadoMapeado, ID_ORGANIZACION, fecha);
    actualizadas++;
  }

  console.log(`actualizadas en esta corrida: ${actualizadas}`);
  console.log(`ya alineadas (no-op): ${yaAlineadas}`);
  console.log(`filas Notion con estado vacio (saltadas): ${estadoVacio}`);
  console.log(`filas Notion con estado sin mapeo en mapearEstadoNotion: ${estadoNoMapeado.length}`);
  if (estadoNoMapeado.length > 0) {
    console.log('  ' + estadoNoMapeado.join('\n  '));
  }
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
