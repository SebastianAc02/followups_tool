// A (2026-07-15): la linea 573105182997 apuntaba a la instancia 'prueba', que Evolution
// ya no tiene. desconectar tiraba 404 y dejaba la fila en 'activa' -- punto verde sobre
// una linea que no existe. Un 404 'instance does not exist' NO es ambiguo: es la prueba
// de que la linea murio, y la fila tiene que enterarse. Un error ambiguo (500, timeout)
// es lo contrario: no sabemos en que estado quedo, y mentir escribiendo algo es peor que
// no tocar la fila (ver el comentario original de desconectarLineaAction).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { lineaWhatsappPorId } = await import('../db/repository.ts');
const { marcarCaidaSiNoExiste } = await import('./recuperacion-linea.ts');
const { ErrorEvolution } = await import('../adapters/evolution.ts');

test('desconectar una linea cuya instancia ya no existe la deja caida, no activa', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO linea_whatsapp (id, numero, tipo, id_usuario, referencia_proveedor, estado)
       VALUES (1, '573105182997', 'personal', 'u1', 'prueba', 'activa')`,
    )
    .run();
  raw.close();

  const err = new ErrorEvolution(
    404,
    '{"response":{"message":["The \\"prueba\\" instance does not exist"]}}',
    '/instance/logout/prueba',
  );
  const manejado = marcarCaidaSiNoExiste(1, err);

  assert.strictEqual(manejado, true, 'el 404 de instancia inexistente se maneja');
  assert.strictEqual(lineaWhatsappPorId(1)?.estado, 'caida', 'la fila deja de mentir');
});

test('un error ambiguo (500) NO toca la fila: no sabemos en que estado quedo', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO linea_whatsapp (id, numero, tipo, id_usuario, referencia_proveedor, estado)
       VALUES (2, '573001112222', 'personal', 'u1', 'wa-573001112222', 'activa')`,
    )
    .run();
  raw.close();

  const manejado = marcarCaidaSiNoExiste(2, new ErrorEvolution(500, 'boom', '/instance/logout/x'));

  assert.strictEqual(manejado, false);
  assert.strictEqual(lineaWhatsappPorId(2)?.estado, 'activa', 'un error ambiguo no cambia la fila');
});

test('un error que no es de Evolution (ej. bug de programacion) tampoco toca la fila', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO linea_whatsapp (id, numero, tipo, id_usuario, referencia_proveedor, estado)
       VALUES (3, '573003334444', 'personal', 'u1', 'wa-573003334444', 'activa')`,
    )
    .run();
  raw.close();

  const manejado = marcarCaidaSiNoExiste(3, new Error('algo random'));

  assert.strictEqual(manejado, false);
  assert.strictEqual(lineaWhatsappPorId(3)?.estado, 'activa');
});

test.after(() => borrarDbPrueba(dbPath));
