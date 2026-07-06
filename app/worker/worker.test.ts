import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { ejecutarCiclo } = await import('./index.ts');

function leerHeartbeat(proveedor: string) {
  const raw = new Database(dbPath);
  const fila = raw
    .prepare('SELECT ultima_corrida, ultimo_resultado FROM conector WHERE proveedor = ? AND id_usuario IS NULL')
    .get(proveedor) as { ultima_corrida: string | null; ultimo_resultado: string | null } | undefined;
  raw.close();
  return fila;
}

test('tarea que corre bien deja heartbeat "ok"', async () => {
  await ejecutarCiclo([{ nombre: 'outbox', proveedorHeartbeat: 'notion', ejecutar: async () => {} }]);
  const fila = leerHeartbeat('notion');
  assert.ok(fila?.ultima_corrida);
  assert.strictEqual(fila?.ultimo_resultado, 'ok');
});

test('tarea que truena queda aislada: heartbeat de error, no relanza', async () => {
  await assert.doesNotReject(
    ejecutarCiclo([
      {
        nombre: 'tarea-rota',
        proveedorHeartbeat: 'proveedor-roto',
        ejecutar: async () => {
          throw new Error('fallo simulado');
        },
      },
    ]),
  );
  const fila = leerHeartbeat('proveedor-roto');
  assert.ok(fila?.ultima_corrida);
  assert.match(fila?.ultimo_resultado ?? '', /fallo simulado/);
});

test('una tarea rota no bloquea que las demas corran (aislamiento)', async () => {
  await ejecutarCiclo([
    {
      nombre: 'rota',
      proveedorHeartbeat: 'proveedor-a',
      ejecutar: async () => {
        throw new Error('boom');
      },
    },
    { nombre: 'sana', proveedorHeartbeat: 'proveedor-b', ejecutar: async () => {} },
  ]);
  assert.strictEqual(leerHeartbeat('proveedor-a')?.ultimo_resultado, 'error: boom');
  assert.strictEqual(leerHeartbeat('proveedor-b')?.ultimo_resultado, 'ok');
});

test.after(() => borrarDbPrueba(dbPath));
