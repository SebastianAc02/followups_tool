// toque.tipo_toque: QUE clase de toque fue, en el vocabulario de la secuencia comercial
// (propuesta de tandas, 2026-08-04). Es lo que hoy no se puede contar sin contaminar: el mix por
// tipo se venia derivando de la etapa de la cuenta, y la etapa la mueve el toque mismo, asi que
// el toque que gradua una cuenta a reunion_agendada se cuenta como toque de reunion cuando fue
// la llamada fria que la consiguio.
//
// Lo que estas pruebas fijan: que el tipo sea DICHO y nunca derivado (ni del canal ni del
// resultado ni de la etapa), que NULL siga significando "no se dijo", y que se pueda corregir en
// los dos sentidos. La columna existe para medir, y una medicion sobre valores inventados mide
// el invento.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';
import { fechaBogotaISO } from '../lib/date-utils.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToque, editarToque, marcarPerdida, toquesEnRango } = await import('./repository.ts');
const { TIPOS_TOQUE } = await import('./validation.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, estadoNotion = 'contacto_iniciado') {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 1)`,
  ).run(id, id, id, estadoNotion);
  db.close();
}

function tiposDe(idEmpresa: string): (string | null)[] {
  const db = raw();
  const filas = db
    .prepare('SELECT tipo_toque FROM toque WHERE id_empresa = ? ORDER BY id_toque')
    .all(idEmpresa) as { tipo_toque: string | null }[];
  db.close();
  return filas.map((f) => f.tipo_toque);
}

seedEmpresa('tt-1');
seedEmpresa('tt-2');
seedEmpresa('tt-3');
seedEmpresa('tt-4');
seedEmpresa('tt-5', 'on_hold');

// Los cinco valores los dicto el operador en la propuesta. Se fijan aca para que agregar o
// renombrar uno sea una decision visible y no un cambio de una linea que nadie revisa: el dia
// que la lista se mueva, el mix de todo lo capturado antes deja de ser comparable.
test('el vocabulario son los cinco tipos dictados, en ese orden', () => {
  assert.deepEqual([...TIPOS_TOQUE], ['frio', 'reactivacion', 'seguimiento', 'reunion', 'cierre']);
});

test('registrarToque guarda el tipo cuando se dice', () => {
  registrarToque(
    { idEmpresa: 'tt-1', canal: 'llamada', resultado: 'no_contesto', quePaso: 'primera llamada', tipoToque: 'frio' },
    1,
  );
  assert.deepEqual(tiposDe('tt-1'), ['frio']);
});

// La razon de ser de la columna. Un toque con canal 'reunion' NO se convierte solo en tipo
// 'reunion', y un toque sobre una cuenta en on_hold NO se convierte solo en 'reactivacion':
// las dos derivaciones son justo las que contaminan el mix hoy.
test('sin tipo dicho queda NULL, no se deriva del canal ni de la etapa de la cuenta', () => {
  registrarToque(
    { idEmpresa: 'tt-2', canal: 'reunion', resultado: 'reunion_buena', quePaso: 'corrio la demo' },
    1,
  );
  registrarToque({ idEmpresa: 'tt-5', canal: 'llamada', resultado: 'no_contesto', quePaso: 'volvi a marcar' }, 1);

  assert.deepEqual(tiposDe('tt-2'), [null], "canal 'reunion' NO se convierte solo en tipo 'reunion'");
  assert.deepEqual(tiposDe('tt-5'), [null], 'una cuenta en on_hold NO convierte el toque en reactivacion');
});

// tipo y canal son ejes distintos y por eso son dos columnas: el canal es POR DONDE se toco, el
// tipo es A QUE fue. Un WhatsApp empujando la firma es canal whatsapp y tipo cierre, y el dia
// que se quiera saber cuantos cierres se trabajaron por WhatsApp hace falta que los dos existan.
test('el tipo es independiente del canal: un whatsapp puede ser un toque de cierre', () => {
  registrarToque(
    { idEmpresa: 'tt-3', canal: 'whatsapp', resultado: 'contesto_sigue_seguimiento', quePaso: 'le pidio la firma', tipoToque: 'cierre' },
    1,
  );
  const db = raw();
  const fila = db.prepare(`SELECT canal, tipo_toque FROM toque WHERE id_empresa='tt-3'`).get() as {
    canal: string;
    tipo_toque: string;
  };
  db.close();
  assert.deepEqual(fila, { canal: 'whatsapp', tipo_toque: 'cierre' });
});

// Una perdida tambien fue un toque de alguna clase, y saber en que clase de toque se cae una
// cuenta es la mitad de la pregunta: perder en un cierre y perder en un frio son dos problemas
// distintos con dos respuestas distintas.
test('marcarPerdida guarda el tipo del toque en el que se cayo la cuenta', () => {
  marcarPerdida(
    { idEmpresa: 'tt-4', canal: 'llamada', razonPerdida: 'precio', quePaso: 'se cayo en el cierre', tipoToque: 'cierre' },
    1,
  );
  assert.deepEqual(tiposDe('tt-4'), ['cierre']);
});

test('editarToque corrige el tipo, y tambien puede borrarlo a NULL', () => {
  const r = registrarToque(
    { idEmpresa: 'tt-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'segundo toque', tipoToque: 'seguimiento' },
    1,
  );
  const idToque = r.toque.idToque;

  editarToque({ idToque, motivo: 'era una reactivacion, la cuenta llevaba tres meses quieta', tipoToque: 'reactivacion' }, 1);
  assert.equal(tiposDe('tt-1')[1], 'reactivacion');

  editarToque({ idToque, motivo: 'lo puse por costumbre, no se dijo que clase de toque fue', tipoToque: null }, 1);
  assert.equal(tiposDe('tt-1')[1], null, 'un tipo mal puesto se puede volver a "no se dijo"');
});

test('un tipo fuera del vocabulario no entra', () => {
  assert.throws(() =>
    registrarToque(
      { idEmpresa: 'tt-1', canal: 'llamada', resultado: 'no_contesto', quePaso: 'x', tipoToque: 'prospeccion' as never },
      1,
    ),
  );
});

// Sin esto la columna se escribe y no se puede leer, que es como estuvieron las tres columnas de
// transcript: existian en la tabla y ningun camino las devolvia.
test('el tipo viaja en la lectura, no solo en la escritura', () => {
  const hoy = fechaBogotaISO();
  const fila = toquesEnRango(hoy, hoy, 1).find((t) => t.idEmpresa === 'tt-4');
  assert.equal(fila?.tipoToque, 'cierre');
});

// El toque releido es lo que ve quien registra: un { ok: true } no es verificable y por eso
// registrarToque devuelve la fila. Un campo que no viaja en esa fila obliga a volver a
// consultar para saber si quedo escrito.
test('registrarToque devuelve el tipo en el toque releido', () => {
  const r = registrarToque(
    { idEmpresa: 'tt-3', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'confirmo la reunion', tipoToque: 'reunion' },
    1,
  );
  assert.equal(r.toque.tipoToque, 'reunion');
});
