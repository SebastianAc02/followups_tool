// Pruebas de la logica nueva de Pantalla 1 (Toques): que tandas son "para llamar", como se
// arranca, como se avanza sin volver a la lista, y como se resuelve una URL que ya no coincide
// con la base (una cuenta que se toco entretanto y se movio de tanda).
//
// gruposLlamables/posicionInicial/resolverPosicion/cuentaEnPosicion/siguientePosicion son PURAS
// (reciben los grupos ya armados, no tocan DB): se prueban con fixtures a mano, mismo criterio
// que app/core/tandas.test.ts. fichaCuentaActual SI toca DB (getCuenta): el archivo entero se
// carga contra una DB de prueba (mismo patron que app/cola/hoy.test.ts) porque tandas-datos.ts
// importa app/db/repository.ts en su cabecera, y esa importacion abre la conexion real si
// ISPS_DB_PATH no esta seteado ANTES de importar -- por eso el env se fija antes de cualquier
// import del modulo bajo prueba, no dentro de un test suelto.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  TANDAS_LLAMABLES,
  gruposLlamables,
  posicionInicial,
  resolverPosicion,
  cuentaEnPosicion,
  siguientePosicion,
  totalLlamable,
  fichaCuentaActual,
} = await import('./tandas-datos.ts');
type GrupoTanda = Awaited<ReturnType<typeof gruposLlamables>>[number];
type TandasDelDia = Parameters<typeof gruposLlamables>[0];

function raw() {
  return new Database(dbPath);
}

// Una cuenta minima de ResultadoTanda, solo con lo que estas pruebas necesitan.
function cuenta(idEmpresa: string, diasEnEstado: number | null = null) {
  return {
    idEmpresa,
    cuenta: idEmpresa,
    tanda: 'rellamada' as const,
    regla: 'test',
    evidencia: { campo: '', valor: null, fuente: null, fecha: null, quien: null },
    usuarios: { valor: null, fuente: null, confirmado: false },
    advertencias: [] as string[],
    owner: 'Sebastian Acosta Molina',
    proximoCanal: null,
    diasEnEstado,
  };
}

function grupo(tanda: GrupoTanda['tanda'], cuentas: ReturnType<typeof cuenta>[]): GrupoTanda {
  return { tanda, total: cuentas.length, cuentas };
}

function datos(tandas: GrupoTanda[]): TandasDelDia {
  return {
    organizacion: 1,
    hoy: '2026-08-04',
    owner: 'Sebastian Acosta Molina',
    piso: 1000,
    tandas,
    totales: {} as TandasDelDia['totales'],
    sinVerificarAliado: 0,
    sinTamanoConfirmado: 0,
    fueraOmitidas: 0,
  };
}

test('TANDAS_LLAMABLES excluye fuera, esperar y bloqueado_por_tarea', () => {
  assert.ok(!TANDAS_LLAMABLES.includes('fuera'));
  assert.ok(!TANDAS_LLAMABLES.includes('esperar'));
  assert.ok(!TANDAS_LLAMABLES.includes('bloqueado_por_tarea'));
  // El resto de las doce SI son llamables, en el mismo orden de TANDAS.
  assert.deepEqual(TANDAS_LLAMABLES, [
    'cierre',
    'reunion',
    'respondio',
    'agotada',
    'enfriandose',
    'rellamada',
    'frio',
    'cadencia',
    'sin_campana',
  ]);
});

test('gruposLlamables se queda solo con las tandas llamables, en el orden de TANDAS', () => {
  const d = datos([
    grupo('esperar', [cuenta('a')]),
    grupo('cierre', [cuenta('b')]),
    grupo('bloqueado_por_tarea', [cuenta('c')]),
    grupo('rellamada', [cuenta('d')]),
  ]);

  const g = gruposLlamables(d);
  assert.deepEqual(
    g.map((x) => x.tanda),
    ['cierre', 'rellamada'],
  );
});

test('posicionInicial arranca en la primera tanda llamable con cuentas, indice 0', () => {
  const grupos = [grupo('cierre', []), grupo('reunion', [cuenta('a'), cuenta('b')])];
  assert.deepEqual(posicionInicial(grupos), { tanda: 'reunion', indice: 0 });
});

test('posicionInicial es null cuando no queda nada por llamar', () => {
  assert.equal(posicionInicial([]), null);
  assert.equal(posicionInicial([grupo('cierre', [])]), null);
});

test('resolverPosicion respeta lo que pide la URL cuando existe', () => {
  const grupos = [grupo('rellamada', [cuenta('a'), cuenta('b'), cuenta('c')])];
  assert.deepEqual(resolverPosicion(grupos, { tanda: 'rellamada', i: '2' }), { tanda: 'rellamada', indice: 2 });
});

test('resolverPosicion cae al default si la tanda pedida ya no tiene cuentas (se vacio)', () => {
  const grupos = [grupo('cierre', [cuenta('a')]), grupo('rellamada', [])];
  assert.deepEqual(resolverPosicion(grupos, { tanda: 'rellamada', i: '0' }), { tanda: 'cierre', indice: 0 });
});

test('resolverPosicion cae al inicio de la tanda si el indice pedido se salio de rango', () => {
  const grupos = [grupo('rellamada', [cuenta('a'), cuenta('b')])];
  assert.deepEqual(resolverPosicion(grupos, { tanda: 'rellamada', i: '9' }), { tanda: 'rellamada', indice: 0 });
});

test('resolverPosicion sin nada en la URL usa el default', () => {
  const grupos = [grupo('cierre', [cuenta('a')])];
  assert.deepEqual(resolverPosicion(grupos, {}), { tanda: 'cierre', indice: 0 });
});

test('cuentaEnPosicion trae la cuenta exacta de la tanda e indice pedidos', () => {
  const grupos = [grupo('rellamada', [cuenta('a'), cuenta('b')])];
  assert.equal(cuentaEnPosicion(grupos, { tanda: 'rellamada', indice: 1 })?.idEmpresa, 'b');
  assert.equal(cuentaEnPosicion(grupos, null), null);
});

test('siguientePosicion avanza dentro de la misma tanda primero', () => {
  const grupos = [grupo('rellamada', [cuenta('a'), cuenta('b'), cuenta('c')])];
  assert.deepEqual(siguientePosicion(grupos, { tanda: 'rellamada', indice: 0 }), { tanda: 'rellamada', indice: 1 });
});

// El caso central del rediseno: "sin volver a la lista". Agotada la tanda actual, salta sola a
// la proxima tanda llamable que tenga trabajo, respetando la prioridad de TANDAS_LLAMABLES --
// nunca de vuelta a una pantalla de eleccion.
test('siguientePosicion salta a la proxima tanda llamable cuando se acaba la actual', () => {
  const grupos = [grupo('cierre', [cuenta('a')]), grupo('reunion', []), grupo('respondio', [cuenta('b')])];
  assert.deepEqual(siguientePosicion(grupos, { tanda: 'cierre', indice: 0 }), { tanda: 'respondio', indice: 0 });
});

test('siguientePosicion es null cuando ya no queda nada por llamar', () => {
  const grupos = [grupo('cierre', [cuenta('a')])];
  assert.equal(siguientePosicion(grupos, { tanda: 'cierre', indice: 0 }), null);
});

test('siguientePosicion sobre null se queda en null', () => {
  assert.equal(siguientePosicion([], null), null);
});

test('totalLlamable suma las cuentas de todos los grupos que recibe', () => {
  const grupos = [grupo('cierre', [cuenta('a'), cuenta('b')]), grupo('rellamada', [cuenta('c')])];
  assert.equal(totalLlamable(grupos), 3);
});

// --- fichaCuentaActual: toca DB, misma DB de prueba de este archivo -----------------------

test('fichaCuentaActual: contacto principal, ultimo toque real (no un WhatsApp entrante), y proximo paso', () => {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_paso, organizacion_activa_id)
     VALUES ('e1', 'nit', 'Cuenta Uno', 'cuenta uno', 'activo', 'Sebastian Acosta Molina', 'contacto_iniciado', 'preguntar por el CRM', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, cargo, telefono, es_principal, fuente) VALUES ('e1', 'Ana', 'Gerente', '3001234567', 1, 'seed')`,
  ).run();
  // El mas reciente es un WhatsApp entrante: no debe ganar como "ultimo toque real".
  db.prepare(
    `INSERT INTO toque (id_empresa, fecha, fecha_dia, canal, resultado, que_paso, fuente, id_organizacion) VALUES ('e1', '2026-08-03T10:00:00Z', '2026-08-03', 'whatsapp', NULL, NULL, 'whatsapp_entrante', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO toque (id_empresa, fecha, fecha_dia, canal, resultado, que_paso, fuente, id_organizacion) VALUES ('e1', '2026-08-01T10:00:00Z', '2026-08-01', 'llamada', 'no_contesto', 'no contesto, se dejo mensaje', 'cockpit', 1)`,
  ).run();
  db.close();

  const ficha = fichaCuentaActual('e1', 1);
  assert.equal(ficha?.contacto, 'Ana');
  assert.equal(ficha?.telefono, '3001234567');
  assert.equal(ficha?.proximoPaso, 'preguntar por el CRM');
  assert.equal(ficha?.ultimoQuePaso, 'no contesto, se dejo mensaje');
  assert.equal(ficha?.ultimoResultado, 'no_contesto');
});

test('fichaCuentaActual: cuenta sin contactos no revienta, todo llega null', () => {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, organizacion_activa_id)
     VALUES ('e2', 'nit', 'Cuenta Dos', 'cuenta dos', 'activo', 'Sebastian Acosta Molina', 1)`,
  ).run();
  db.close();

  const ficha = fichaCuentaActual('e2', 1);
  assert.equal(ficha?.contacto, null);
  assert.equal(ficha?.telefono, null);
  assert.equal(ficha?.ultimoQuePaso, null);
});

test('fichaCuentaActual: cuenta inexistente devuelve null', () => {
  assert.equal(fichaCuentaActual('no-existe', 1), null);
});
