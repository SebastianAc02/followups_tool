import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { ejecutarCiclo, construirTareas } = await import('./index.ts');

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

// Gate de outbox (2026-07-24): el brain escribe Notion por su cuenta y nunca encola en
// `outbox` -- en produccion la tabla tiene 2 filas, las dos fallidas desde julio. La tarea
// queda en el codigo pero apagada por default; lo que se fija aca es que apagar NO se lleve
// por delante a las otras cinco, que son las que sostienen envios y campanas.
const NUCLEO = ['materializar', 'push:correo', 'push:whatsapp', 'tracking', 'archivar-campanas'];

test('sin OUTBOX_NOTION_ENABLED, outbox no se registra y las otras cinco siguen', () => {
  delete process.env.OUTBOX_NOTION_ENABLED;
  assert.deepStrictEqual(construirTareas().map((t) => t.nombre), NUCLEO);
});

test('con OUTBOX_NOTION_ENABLED=true, outbox vuelve a registrarse y nada mas cambia', () => {
  process.env.OUTBOX_NOTION_ENABLED = 'true';
  try {
    assert.deepStrictEqual(construirTareas().map((t) => t.nombre), ['outbox', ...NUCLEO]);
  } finally {
    delete process.env.OUTBOX_NOTION_ENABLED;
  }
});

test('solo un valor explicito enciende: el resto (vacio, 0, false, yes) queda apagado', () => {
  try {
    for (const valor of ['true', '1', 'TRUE', ' true ']) {
      process.env.OUTBOX_NOTION_ENABLED = valor;
      assert.ok(
        construirTareas().some((t) => t.nombre === 'outbox'),
        `${JSON.stringify(valor)} deberia encender el gate`,
      );
    }
    for (const valor of ['', '0', 'false', 'yes', 'enabled']) {
      process.env.OUTBOX_NOTION_ENABLED = valor;
      assert.ok(
        !construirTareas().some((t) => t.nombre === 'outbox'),
        `${JSON.stringify(valor)} NO deberia encender el gate`,
      );
    }
  } finally {
    delete process.env.OUTBOX_NOTION_ENABLED;
  }
});

test.after(() => borrarDbPrueba(dbPath));
