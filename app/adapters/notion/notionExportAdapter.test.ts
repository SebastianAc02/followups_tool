// Fixture chico en __fixtures__: 2 .md por-pagina (ACUAVALLE con subcarpeta, Jigartel
// sin subcarpeta) + 1 CSV recortado del export real (_all.csv) con BOM y campos con
// coma entre comillas. SIN MD SAS solo esta en el CSV para probar pageId=null.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearNotionExportAdapter } from './notionExportAdapter.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirFixtures = path.join(__dirname, '__fixtures__');

test('lee el export por-pagina + CSV y devuelve una empresa por fila del CSV', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, 'pipeline_all.csv');
  const empresas = adapter.leerEmpresas();

  assert.equal(empresas.length, 3);
});

test('enlaza pageId desde el nombre de archivo .md y detecta la subcarpeta', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, 'pipeline_all.csv');
  const empresas = adapter.leerEmpresas();

  const acuavalle = empresas.find((e) => e.nombre === 'ACUAVALLE');
  assert.ok(acuavalle);
  assert.equal(acuavalle!.pageId, '35a95153c5cd805086b8c69965e0f34a');
  assert.equal(acuavalle!.subcarpeta, path.join(dirFixtures, 'ACUAVALLE'));
  assert.equal(acuavalle!.industria, 'Agua');
  assert.equal(acuavalle!.usuariosEstimados, '240,000');
  assert.equal(acuavalle!.pasarela, 'PSE, PlacetoPay, Wompi');
});

test('empresa sin .md correspondiente queda con pageId null y sin subcarpeta', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, 'pipeline_all.csv');
  const empresas = adapter.leerEmpresas();

  const sinMd = empresas.find((e) => e.nombre === 'SIN MD SAS');
  assert.ok(sinMd);
  assert.equal(sinMd!.pageId, null);
  assert.equal(sinMd!.subcarpeta, null);
  assert.equal(sinMd!.cargo, 'Gerente');
  assert.equal(sinMd!.email, 'ana@sinmd.com');
  assert.equal(sinMd!.fechaProximoPaso, 'April 1, 2026');
});

test('quita el BOM de la primera columna del CSV', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, 'pipeline_all.csv');
  const empresas = adapter.leerEmpresas();

  assert.ok(empresas.every((e) => e.nombre.charCodeAt(0) !== 0xfeff));
  const jigartel = empresas.find((e) => e.nombre === 'Jigartel');
  assert.ok(jigartel);
  assert.equal(jigartel!.contactoPrincipal, 'Nayris');
  assert.equal(jigartel!.crm, 'Propio / Otro');
});

test('correr dos veces devuelve exactamente los mismos datos (idempotente en lectura)', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, 'pipeline_all.csv');
  assert.deepEqual(adapter.leerEmpresas(), adapter.leerEmpresas());
});
