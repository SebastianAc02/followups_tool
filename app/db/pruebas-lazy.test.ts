// Regresion (2026-07-16): importar app/db/index NO debe abrir pruebas.db.
//
// Antes, el modulo abria las DOS bases al cargarse (`new Database(PRUEBAS_DB_PATH)` a nivel
// de modulo). En produccion PRUEBAS_DB_PATH no existe como variable (el .env.production del
// VPS se creo antes de que el modo prueba existiera), asi que caia al default hardcodeado
// --una ruta del Mac de Sebastián-- y better-sqlite3 truena con "Cannot open database
// because the directory does not exist". No es un error atrapable: pasa al IMPORTAR, asi que
// la web Y el worker se caian al arrancar. Un merge a main habria tumbado produccion entera.
//
// El fix: pruebas.db se abre PEREZOSO, solo cuando alguien lo usa de verdad. Produccion
// nunca prende el modo prueba, asi que nunca lo abre.

import test from 'node:test';
import assert from 'node:assert/strict';

// Ruta imposible a proposito: simula el VPS, donde la carpeta del default no existe. Se
// setea ANTES del import porque el modulo lee process.env al cargarse.
process.env.ISPS_DB_PATH = ':memory:';
process.env.PRUEBAS_DB_PATH = '/ruta-que-no-existe-jamas/06_onepay/pruebas.db';

// Este import ES el test principal: antes del fix, esta linea sola tumbaba el archivo
// entero con "Cannot open database because the directory does not exist". node forkea por
// archivo de test, asi que este modulo se carga limpio aca.
const { db, dbReal, dbPruebas } = await import('./index.ts');

test('importar el modulo con una ruta de pruebas invalida NO truena', () => {
  // Si llegamos hasta aca, el import de arriba no reventó: produccion arranca.
  assert.ok(db, 'db se exporta');
  assert.ok(dbReal, 'dbReal se exporta');
  assert.ok(dbPruebas, 'dbPruebas se exporta (perezosa, todavia sin abrir)');
});

test('la base REAL funciona aunque la de pruebas sea inalcanzable', () => {
  // Prueba que la conexion real se abrio bien y que la de pruebas rota no la contamina.
  assert.doesNotThrow(() => dbReal.run('SELECT 1'));
});

test('usar la base de pruebas con ruta invalida SI truena (el error no se traga)', () => {
  // Perezoso no es silencioso: si alguien de verdad prende el modo prueba con una ruta
  // mala, tiene que enterarse ahi mismo, no obtener una base fantasma vacia.
  assert.throws(() => dbPruebas.run('SELECT 1'), /directory does not exist|unable to open/i);
});
