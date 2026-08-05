// Pruebas de la logica nueva de Pantalla 2 (Seguimiento): las dos respuestas que la vista vieja
// ("Toque uno, Toque dos, Aun no entran, Sin cadencia") no daba -- quien se esta enfriando de
// verdad (cruzando TODAS las tandas, no solo la cabeza de una columna) y cuanta deuda propia hay
// en bloqueado_por_tarea. El agrupamiento y el orden por dias en el estado en si NO se prueban
// aca: ya salen resueltos y probados de tandasTool (app/mcp/server.tandas.test.ts) -- esta
// pantalla los consume tal cual, nunca los reordena.
//
// Import estatico de tandas-datos.ts arrastra app/mcp/tools.ts -> app/db/repository.ts, que abre
// la conexion real si ISPS_DB_PATH no esta seteado ANTES de importar (mismo motivo que
// app/cola/tandas-datos.test.ts). Estas pruebas son puras (no tocan DB), pero igual necesitan el
// env fijado antes del import por como esta armada la cadena de modulos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba } from '../db/test-helpers.ts';
import type { GrupoTanda, TandasDelDia } from './tandas-datos.ts';

process.env.ISPS_DB_PATH = crearDbPrueba();

const { deudaDelOperador, masViejasEnEstado } = await import('./tandas-datos.ts');

function cuenta(idEmpresa: string, tanda: GrupoTanda['tanda'], diasEnEstado: number | null) {
  return {
    idEmpresa,
    cuenta: idEmpresa,
    tanda,
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

test('deudaDelOperador trae la columna bloqueado_por_tarea cuando tiene cuentas', () => {
  const d = datos([
    grupo('cierre', [cuenta('a', 'cierre', 3)]),
    grupo('bloqueado_por_tarea', [cuenta('b', 'bloqueado_por_tarea', 12)]),
  ]);

  const deuda = deudaDelOperador(d);
  assert.equal(deuda?.tanda, 'bloqueado_por_tarea');
  assert.equal(deuda?.total, 1);
});

test('deudaDelOperador es null si no hay tanda bloqueado_por_tarea (no se pinta un callout vacio)', () => {
  const d = datos([grupo('cierre', [cuenta('a', 'cierre', 3)])]);
  assert.equal(deudaDelOperador(d), null);
});

test('deudaDelOperador es null si la tanda existe pero esta vacia', () => {
  const d = datos([grupo('bloqueado_por_tarea', [])]);
  assert.equal(deudaDelOperador(d), null);
});

test('masViejasEnEstado cruza TODAS las tandas por dias en el estado, no solo una columna', () => {
  const d = datos([
    grupo('cierre', [cuenta('a', 'cierre', 2)]),
    grupo('rellamada', [cuenta('b', 'rellamada', 20), cuenta('c', 'rellamada', 5)]),
    grupo('frio', [cuenta('e', 'frio', 45)]),
  ]);

  const viejas = masViejasEnEstado(d, 3);
  assert.deepEqual(
    viejas.map((c) => c.idEmpresa),
    ['e', 'b', 'c'],
  );
});

test('masViejasEnEstado excluye la tanda esperar (pausa, no enfriamiento)', () => {
  const d = datos([grupo('esperar', [cuenta('a', 'esperar', 99)]), grupo('cierre', [cuenta('b', 'cierre', 1)])]);

  const viejas = masViejasEnEstado(d, 5);
  assert.deepEqual(
    viejas.map((c) => c.idEmpresa),
    ['b'],
  );
});

test('masViejasEnEstado nunca mete un diasEnEstado null: tiempo desconocido no es "se acaba de enfriar"', () => {
  const d = datos([grupo('sin_campana', [cuenta('a', 'sin_campana', null), cuenta('b', 'sin_campana', 7)])]);

  const viejas = masViejasEnEstado(d, 5);
  assert.deepEqual(
    viejas.map((c) => c.idEmpresa),
    ['b'],
  );
});

test('masViejasEnEstado respeta el limite n', () => {
  const d = datos([grupo('frio', [cuenta('a', 'frio', 10), cuenta('b', 'frio', 20), cuenta('c', 'frio', 30)])]);
  assert.equal(masViejasEnEstado(d, 2).length, 2);
});
