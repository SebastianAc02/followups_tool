// M (2026-07-15): tres scripts de sync tenian su propia copia de "cruzar empresa Notion
// con empresa DB", todas con los bugs que T14 ya habia resuelto en importar_toques_legacy:
// page_id con guiones (213 empresas enlazadas por MCP lo traen asi) que no matcheaba
// contra el page_id sin guiones del adapter, y sin fallback por razon social. 122 filas
// de Notion quedaron sin enlazar. Este helper es la fuente unica de ese match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirIndiceEmpresasDb, matchEmpresaNotion } from './matchNotion.ts';

type Fila = { idEmpresa: string; nombreOficial: string; notionPageId: string | null; operaBajoId: string | null };

const DB: Fila[] = [
  { idEmpresa: '901289465', nombreOficial: 'INTERCARIBE TV S.A.S.', notionPageId: '30c95153-c5cd-8129-91bf-c7cbb1c9bc14', operaBajoId: null },
  { idEmpresa: '900014381', nombreOficial: 'CABLE NET S.A.S.', notionPageId: null, operaBajoId: null },
  { idEmpresa: 'ntn-fundida', nombreOficial: 'Fundida', notionPageId: 'aaaa', operaBajoId: '901289465' },
];

test('matchea por page_id aunque la DB lo tenga con guiones y Notion sin guiones', () => {
  const idx = construirIndiceEmpresasDb(DB);
  const m = matchEmpresaNotion(idx, { pageId: '30c95153c5cd812991bfc7cbb1c9bc14', nombre: 'lo que sea' });
  assert.equal(m?.idEmpresa, '901289465');
});

test('cae a razon social normalizada cuando no hay page_id (S.A.S. vs S A S)', () => {
  const idx = construirIndiceEmpresasDb(DB);
  const m = matchEmpresaNotion(idx, { pageId: null, nombre: 'CABLE NET S A S' });
  assert.equal(m?.idEmpresa, '900014381');
});

test('nunca matchea una fila fundida (opera_bajo_id no nulo)', () => {
  const idx = construirIndiceEmpresasDb(DB);
  const m = matchEmpresaNotion(idx, { pageId: 'aaaa', nombre: 'Fundida' });
  assert.equal(m, null);
});

test('devuelve ambiguo (null + motivo) cuando el nombre normalizado tiene 2+ candidatos', () => {
  const dup: Fila[] = [
    { idEmpresa: 'a', nombreOficial: 'ACME S.A.S.', notionPageId: null, operaBajoId: null },
    { idEmpresa: 'b', nombreOficial: 'ACME SAS', notionPageId: null, operaBajoId: null },
  ];
  const idx = construirIndiceEmpresasDb(dup);
  const r = matchEmpresaNotion(idx, { pageId: null, nombre: 'ACME S.A.S.' });
  assert.equal(r, null);
});

// Cable Cauca (resuelto a mano 2026-07-15): empresa_alias tiene la resolucion humana
// desde mayo ("resolver una vez, para siempre"). El fallback por nombre debe consultar
// el alias ANTES que la razon social cruda -- si el nombre de Notion no es la razon
// social oficial pero SI es un alias ya resuelto, el alias gana.
test('el alias resuelto a mano tiene prioridad sobre la razon social cruda', () => {
  const dbConAlias: Fila[] = [
    { idEmpresa: 'cable-cauca', nombreOficial: 'CABLE CAUCA S.A.S.', notionPageId: null, operaBajoId: null },
  ];
  const idx = construirIndiceEmpresasDb(dbConAlias, [
    { idEmpresa: 'cable-cauca', alias: 'Cable Cauca-Home TV' },
  ]);
  const m = matchEmpresaNotion(idx, { pageId: null, nombre: 'Cable Cauca-Home TV' });
  assert.equal(m?.idEmpresa, 'cable-cauca');
});
