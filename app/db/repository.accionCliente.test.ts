// toque.accion_cliente: hasta donde se movio el CLIENTE en el toque, en escala ordinal de
// compromiso (dictado del operador, 2026-07-26). El resto de las columnas del toque miden como
// salio para nosotros; esta mide al otro lado.
//
// Lo que estas pruebas fijan, y es lo unico que hace util a la columna: que el orden se
// mantenga (es lo que permite leer un buyer journey y ver donde se estanca un perdido), que
// NULL signifique "no se dijo" y nunca se rellene solo, y que se pueda corregir en los dos
// sentidos, incluido volver a NULL.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToque, editarToque, marcarPerdida, toquesEnRango } = await import('./repository.ts');
const { ACCIONES_CLIENTE, NIVEL_ACCION_CLIENTE, OBJECIONES } = await import('./validation.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1)`,
  ).run(id, id, id);
  db.close();
}

function accionesDe(idEmpresa: string): (string | null)[] {
  const db = raw();
  const filas = db
    .prepare('SELECT accion_cliente FROM toque WHERE id_empresa = ? ORDER BY id_toque')
    .all(idEmpresa) as { accion_cliente: string | null }[];
  db.close();
  return filas.map((f) => f.accion_cliente);
}

seedEmpresa('ac-1');
seedEmpresa('ac-2');
seedEmpresa('ac-3');
seedEmpresa('ac-4');

// El orden ES el dato. Si alguien reordena la lista o renumera el mapa, esto se cae: es la
// unica forma de que "negocia esta por encima de revela_informacion" sea una afirmacion
// verificada y no un comentario.
test('la escala es ordinal, siete niveles, 0 a 6 en el orden dictado', () => {
  assert.deepEqual(
    [...ACCIONES_CLIENTE],
    ['sin_cliente', 'concede_atencion', 'revela_informacion', 'invierte_tiempo', 'evaluacion_interna', 'negocia', 'se_compromete'],
  );
  assert.deepEqual(
    ACCIONES_CLIENTE.map((a) => NIVEL_ACCION_CLIENTE[a]),
    [0, 1, 2, 3, 4, 5, 6],
  );
});

test('registrarToque guarda la accion cuando se dice', () => {
  registrarToque(
    { idEmpresa: 'ac-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'conto su CRM', accionCliente: 'revela_informacion' },
    1,
  );
  assert.deepEqual(accionesDe('ac-1'), ['revela_informacion']);
});

// NULL = no se dijo. No hay default y no se deriva del resultado: "no contesto" hace pensar en
// sin_cliente, pero el que sabe que hizo el cliente es quien estuvo en la llamada, y un ordinal
// inventado corrompe justo la medicion para la que la columna existe.
test('sin accion dicha queda NULL, no un default ni un valor derivado del resultado', () => {
  registrarToque({ idEmpresa: 'ac-2', canal: 'llamada', resultado: 'no_contesto', quePaso: 'no contesto' }, 1);
  assert.deepEqual(accionesDe('ac-2'), [null], 'no_contesto NO se convierte solo en sin_cliente');
});

// La secuencia por fecha es el buyer journey de la cuenta, y tiene que poder BAJAR. Una cuenta
// que llego a negocia y volvio a concede_atencion retrocedio, y ese retroceso es la senal que
// una lista de etiquetas sin orden no puede expresar.
test('la escala sube y baja: el retroceso de una cuenta queda legible', () => {
  const pasos = ['concede_atencion', 'revela_informacion', 'negocia', 'concede_atencion'] as const;
  for (const accion of pasos) {
    registrarToque({ idEmpresa: 'ac-3', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: accion, accionCliente: accion }, 1);
  }

  const niveles = accionesDe('ac-3').map((a) => NIVEL_ACCION_CLIENTE[a as keyof typeof NIVEL_ACCION_CLIENTE]);
  assert.deepEqual(niveles, [1, 2, 5, 1]);
  assert.ok(niveles[3] < niveles[2], 'el ultimo toque es un retroceso, no un empate');
});

// El nivel al que llego una cuenta ANTES de caerse es lo que responde donde se frena el embudo.
test('marcarPerdida guarda el nivel al que llego la cuenta antes de perderse', () => {
  marcarPerdida(
    { idEmpresa: 'ac-4', canal: 'llamada', razonPerdida: 'precio', quePaso: 'se cayo negociando', accionCliente: 'negocia' },
    1,
  );
  assert.deepEqual(accionesDe('ac-4'), ['negocia']);
});

test('editarToque corrige la accion, y tambien puede borrarla a NULL', () => {
  const r = registrarToque(
    { idEmpresa: 'ac-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'segundo toque', accionCliente: 'invierte_tiempo' },
    1,
  );
  const idToque = r.toque.idToque;

  // motivo es obligatorio en editarToque: es lo unico que distingue "llego el dato de tl;dv"
  // de "me equivoque al dictar", y queda en la bitacora junto al campo que se movio.
  editarToque({ idToque, motivo: 'lo confirmo en la llamada de seguimiento', accionCliente: 'evaluacion_interna' }, 1);
  assert.equal(accionesDe('ac-1')[1], 'evaluacion_interna');

  editarToque({ idToque, motivo: 'lo puse por error, el cliente no dijo nada de eso', accionCliente: null }, 1);
  assert.equal(accionesDe('ac-1')[1], null, 'una accion mal puesta se puede volver a "no se dijo"');
});

test('un valor fuera de la escala no entra', () => {
  assert.throws(() =>
    registrarToque(
      { idEmpresa: 'ac-1', canal: 'llamada', resultado: 'no_contesto', quePaso: 'x', accionCliente: 'muy_interesado' as never },
      1,
    ),
  );
});

test('la accion viaja en la lectura, no solo en la escritura', () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const fila = toquesEnRango(hoy, hoy, 1).find((t) => t.idEmpresa === 'ac-4');
  assert.equal(fila?.accionCliente, 'negocia');
});

// Dictado del operador (2026-07-26): los dos caian en `precio` y la respuesta comercial a cada
// uno es distinta. empaquetado se responde moviendo el plan o el alcance; riesgo_percibido se
// responde con prueba, y un descuento sobre un miedo no lo mueve.
test('empaquetado y riesgo_percibido son objeciones propias, separadas de precio', () => {
  assert.ok(OBJECIONES.includes('empaquetado'));
  assert.ok(OBJECIONES.includes('riesgo_percibido'));

  registrarToque(
    { idEmpresa: 'ac-2', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'acepta Essential pero necesita integracion', objecion: 'empaquetado' },
    1,
  );
  registrarToque(
    { idEmpresa: 'ac-2', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'teme que el equipo no lo use', objecion: 'riesgo_percibido' },
    1,
  );

  const db = raw();
  const filas = db.prepare(`SELECT objecion FROM toque WHERE id_empresa='ac-2' AND objecion IS NOT NULL ORDER BY id_toque`).all() as {
    objecion: string;
  }[];
  db.close();
  assert.deepEqual(filas.map((f) => f.objecion), ['empaquetado', 'riesgo_percibido']);
});
