// T3: reporte de candidatos a gemelo (Fase 0). Solo LEE (DB real + export de Notion),
// no funde nada. Orquesta NotionExportAdapter (T1) + matcherGemelos (T2) +
// Repository de solo-lectura, y escribe la lista completa a
// planning/dedup-candidatos.md para que Sebastian marque a mano cuales fundir
// (decision cerrada: revision humana de TODOS los pares, sin fusion automatica).
//
// Correr: node --experimental-strip-types --experimental-loader
//   ./scripts/resolve-ts-ext.mjs scripts/dedup_reporte.ts

import { db, schema } from '../app/db/index.ts';
import { crearNotionExportAdapter } from '../app/adapters/notion/notionExportAdapter.ts';
import { encontrarGemelos, type EmpresaDbParaMatch, type TipoIdEmpresa } from '../app/core/reconciliacion/matcherGemelos.ts';

const DIR_EXPORT_NOTION = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline';
// El CSV vive un nivel arriba de la carpeta con los .md por-pagina.
const CSV_PATH = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline f5e2be53a1514d42ac6db30fd7c5202a_all.csv';
const SALIDA = 'planning/dedup-candidatos.md';

function leerEmpresasDb(): EmpresaDbParaMatch[] {
  const filas = db.select({
    idEmpresa: schema.empresa.idEmpresa,
    nombre: schema.empresa.nombreOficial,
    tipoId: schema.empresa.tipoId,
  }).from(schema.empresa).all();

  return filas.map((f) => ({
    idEmpresa: f.idEmpresa,
    nombre: f.nombre,
    tipoId: f.tipoId as TipoIdEmpresa,
  }));
}

function escaparCelda(texto: string): string {
  return texto.replace(/\|/g, '\\|');
}

type Par = ReturnType<typeof encontrarGemelos>[number];

// El gemelo real de Fase 0 (spec: "resuelve gemelos sintetico <-> NIT") no es
// "Notion matchea 1 fila de la DB" (eso es enlace normal, T5) sino "una misma empresa
// de Notion matchea DOS filas de la DB de tipo distinto (una NIT, una sintetica
// ntn-*/999000*)": ahi hay dos registros que son la misma empresa y hay que fundir.
function agruparGemelosAmbiguos(pares: Par[]): { nombreNotion: string; pageIdNotion: string | null; nit: Par; sintetico: Par }[] {
  const porNotion = new Map<string, Par[]>();
  for (const p of pares) {
    const key = p.pageIdNotion ?? `nombre:${p.nombreNotion}`;
    if (!porNotion.has(key)) porNotion.set(key, []);
    porNotion.get(key)!.push(p);
  }

  const grupos: { nombreNotion: string; pageIdNotion: string | null; nit: Par; sintetico: Par }[] = [];
  for (const candidatos of porNotion.values()) {
    const nits = candidatos.filter((c) => c.tipoIdDb === 'nit').sort((a, b) => b.score - a.score);
    const sinteticos = candidatos.filter((c) => c.tipoIdDb !== 'nit').sort((a, b) => b.score - a.score);
    if (nits.length === 0 || sinteticos.length === 0) continue;
    grupos.push({ nombreNotion: nits[0].nombreNotion, pageIdNotion: nits[0].pageIdNotion, nit: nits[0], sintetico: sinteticos[0] });
  }
  return grupos.sort((a, b) => (b.nit.score + b.sintetico.score) - (a.nit.score + a.sintetico.score));
}

function generarMarkdown(pares: Par[], gemelosAmbiguos: ReturnType<typeof agruparGemelosAmbiguos>): string {
  const filasAmbiguos = gemelosAmbiguos.map((g) =>
    `| ${escaparCelda(g.nombreNotion)} | ${escaparCelda(g.nit.idEmpresaDb)} | ${escaparCelda(g.nit.nombreDb)} (${g.nit.score.toFixed(2)}) | ${escaparCelda(g.sintetico.idEmpresaDb)} | ${escaparCelda(g.sintetico.nombreDb)} (${g.sintetico.score.toFixed(2)}) |`
  );

  const ordenadosTodos = [...pares].sort((a, b) => b.score - a.score);
  const filasTodos = ordenadosTodos.map((p) =>
    `| ${p.score.toFixed(2)} | ${escaparCelda(p.idEmpresaDb)} (${p.tipoIdDb}) | ${escaparCelda(p.nombreDb)} | ${escaparCelda(p.pageIdNotion ?? '(sin page_id)')} | ${escaparCelda(p.nombreNotion)} | ${p.camposEnConflicto.join(', ') || '-'} |`
  );

  return [
    '# Candidatos a gemelo (Fase 0, T3)',
    '',
    `Generado por \`scripts/dedup_reporte.ts\`. Solo lectura, no funde nada.`,
    '',
    `## Gemelos ambiguos (una empresa de Notion matchea NIT + sintetico): ${gemelosAmbiguos.length}`,
    '',
    'Estos SI son candidatos reales a fusion (T4). Marca con [x] los que apruebas fundir.',
    '',
    '| empresa Notion | id NIT | nombre NIT (score) | id sintetico | nombre sintetico (score) |',
    '|---|---|---|---|---|',
    ...filasAmbiguos,
    '',
    `## Todos los pares (umbral 0.5), para referencia: ${pares.length}`,
    '',
    '| score | DB id (tipo) | nombre DB | Notion page_id | nombre Notion | campos en conflicto |',
    '|---|---|---|---|---|---|',
    ...filasTodos,
    '',
  ].join('\n');
}

async function main() {
  const empresasDb = leerEmpresasDb();
  const empresasNotion = crearNotionExportAdapter(DIR_EXPORT_NOTION, CSV_PATH).leerEmpresas()
    .filter((e) => e.nombre.trim().length > 0)
    .map((e) => ({ pageId: e.pageId, nombre: e.nombre }));

  console.log(`empresas DB: ${empresasDb.length}, empresas Notion: ${empresasNotion.length}`);

  const pares = encontrarGemelos(empresasDb, empresasNotion, { umbralMinimo: 0.5 });
  const gemelosAmbiguos = agruparGemelosAmbiguos(pares);
  console.log(`pares candidatos (umbral 0.5): ${pares.length}`);
  console.log(`gemelos ambiguos (NIT + sintetico para la misma empresa Notion): ${gemelosAmbiguos.length}`);

  const md = generarMarkdown(pares, gemelosAmbiguos);
  await import('node:fs').then((fs) => fs.writeFileSync(SALIDA, md, 'utf-8'));
  console.log(`Reporte escrito en ${SALIDA}`);
}

main();
