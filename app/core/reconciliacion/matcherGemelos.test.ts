// Casos reales de la exploracion 2026-07-14 (memoria project_notion_db_sync_exploration),
// tomados de isps.db: CELSIA INTERNET tiene gemelo NIT<->Notion; CELSIA COLOMBIA (la
// utility, empresa PADRE distinta) y NETTWINS (empresa distinta a WINS SOLUCIONES) son
// los casos negativos que un matcher ingenuo por substring confundiria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encontrarGemelos } from './matcherGemelos.ts';

test('CELSIA INTERNET (NIT) vs su gemelo Notion es un par con score 1', () => {
  const db = [{ idEmpresa: '901715847', nombre: 'Celsia Internet S.A.S.', tipoId: 'nit' as const }];
  const notion = [{ pageId: null, nombre: 'CELSIA INTERNET S.A.S.' }];

  const pares = encontrarGemelos(db, notion);

  assert.equal(pares.length, 1);
  assert.equal(pares[0].idEmpresaDb, '901715847');
  assert.equal(pares[0].score, 1);
});

test('CELSIA INTERNET (ISP) y CELSIA COLOMBIA (utility, empresa distinta) no son par', () => {
  const db = [{ idEmpresa: '901715847', nombre: 'Celsia Internet S.A.S.', tipoId: 'nit' as const }];
  const notion = [{ pageId: null, nombre: 'CELSIA COLOMBIA S.A. E.S.P.' }];

  const pares = encontrarGemelos(db, notion);

  assert.equal(pares.length, 0);
});

test('NETTWINS y WINS SOLUCIONES no comparten token pese al substring "wins"', () => {
  const db = [{ idEmpresa: '901150039', nombre: 'NETTWINS S.A.S.', tipoId: 'nit' as const }];
  const notion = [{ pageId: null, nombre: 'WINS SOLUCIONES SAS' }];

  const pares = encontrarGemelos(db, notion);

  assert.equal(pares.length, 0);
});

test('umbral configurable: "CELSIA" solo (Notion) es candidato ambiguo, no exacto', () => {
  const db = [{ idEmpresa: '901715847', nombre: 'Celsia Internet S.A.S.', tipoId: 'nit' as const }];
  const notion = [{ pageId: null, nombre: 'CELSIA' }];

  const conUmbralBajo = encontrarGemelos(db, notion, { umbralMinimo: 0.4 });
  const conUmbralAlto = encontrarGemelos(db, notion, { umbralMinimo: 0.9 });

  assert.equal(conUmbralBajo.length, 1);
  assert.ok(conUmbralBajo[0].score < 1 && conUmbralBajo[0].score >= 0.4);
  assert.equal(conUmbralAlto.length, 0);
});

test('marca "nombre" en conflicto cuando la forma escrita difiere, aunque normalizado matchee', () => {
  const db = [{ idEmpresa: '901403469', nombre: 'WINS SOLUCIONES SAS', tipoId: 'nit' as const }];
  const notion = [{ pageId: 'p-1', nombre: 'Wins Soluciones SAS' }];

  const [par] = encontrarGemelos(db, notion);

  assert.equal(par.score, 1);
  assert.deepEqual(par.camposEnConflicto, ['nombre']);
});

test('no escribe nada: es una funcion pura, dos corridas dan el mismo resultado', () => {
  const db = [{ idEmpresa: '901715847', nombre: 'Celsia Internet S.A.S.', tipoId: 'nit' as const }];
  const notion = [{ pageId: null, nombre: 'CELSIA INTERNET S.A.S.' }];

  assert.deepEqual(encontrarGemelos(db, notion), encontrarGemelos(db, notion));
});
