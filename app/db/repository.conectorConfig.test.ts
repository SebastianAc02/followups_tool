// Pruebas del CRUD de conector_config (rediseño de conectores). Verifica agregar/listar/
// cambiar-modo/quitar y que "quitar" deja la fila dormida (habilitado=0), no la borra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 3).toString('base64');

const {
  agregarConfigConector,
  listarConfigConectores,
  actualizarModoConector,
  quitarConfigConector,
  modoConector,
} = await import('./repository.ts');

test('agregar inserta un conector habilitado y listar lo devuelve', () => {
  agregarConfigConector('notion', 'admin', 'user-seb');
  const lista = listarConfigConectores();
  assert.deepEqual(lista, [{ proveedor: 'notion', modo: 'admin', habilitado: true }]);
});

test('agregar dos veces el mismo proveedor no duplica, actualiza el modo', () => {
  agregarConfigConector('granola', 'admin', 'user-seb');
  agregarConfigConector('granola', 'personal', 'user-seb');
  const granola = listarConfigConectores().find((c) => c.proveedor === 'granola');
  assert.equal(granola?.modo, 'personal');
});

test('actualizarModoConector cambia el modo', () => {
  agregarConfigConector('apollo', 'personal', 'user-seb');
  actualizarModoConector('apollo', 'admin');
  assert.equal(modoConector('apollo'), 'admin');
});

test('quitar deja la fila dormida (no aparece en listar) pero no la borra', () => {
  agregarConfigConector('apollo', 'admin', 'user-seb');
  quitarConfigConector('apollo');
  assert.equal(listarConfigConectores().find((c) => c.proveedor === 'apollo'), undefined);
  // re-agregar la re-habilita sin error (la fila seguia ahi)
  agregarConfigConector('apollo', 'personal', 'user-seb');
  assert.equal(modoConector('apollo'), 'personal');
});

test('modoConector devuelve null si el proveedor no esta habilitado', () => {
  assert.equal(modoConector('no-existe'), null);
});

test.after(() => borrarDbPrueba(dbPath));
