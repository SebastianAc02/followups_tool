// empresa.motivo_descarte y empresa.fecha_retorno: por que una cuenta NO entra a la lista, y
// cuando vuelve (propuesta de tandas, 2026-08-04, paso 3).
//
// DESCARTE NO ES PERDIDA, y por eso es una columna aparte de razon_perdida. Una cuenta puede
// rechazar sin estar perdida: "ya es cliente" y "esta congelada hasta octubre" sacan la cuenta de
// la lista de hoy sin que el deal se haya caido. Meterlas en razon_perdida las contaria como
// perdidas en el embudo, que es una medicion distinta.
//
// LA CONGELADA ES EL CASO QUE JUSTIFICA LA FECHA. Hoy vive en prosa dentro del proximo paso ("no
// antes de octubre"), asi que la cuenta sale de la lista a mano y vuelve solo si alguien se
// acuerda. Con fecha real sale sola y vuelve sola. De ahi el invariante que fija este archivo:
// una congelada SIN fecha de retorno no se puede escribir. Un hold sin fecha es un hold que nadie
// vuelve a abrir.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { clasificarDescarte, marcarDescarte } = await import('./repository.ts');
const { MOTIVOS_DESCARTE } = await import('./validation.ts');

function seedEmpresa(id: string) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1)`,
  ).run(id, id, id);
  db.close();
}

const QUIEN = { fuente: 'operador', quien: 'Sebastian Acosta Molina' };

test('el vocabulario son los motivos por los que una cuenta sale de la lista sin estar perdida', () => {
  assert.deepEqual(
    [...MOTIVOS_DESCARTE],
    ['dijo_que_no', 'congelada', 'ya_es_cliente', 'no_avanzo_tras_reunion', 'otro_dueno', 'no_califica'],
  );
});

// El mismo principio que en aliado, un nivel mas arriba: una cuenta sin descarte no es una cuenta
// "aprobada", es una cuenta sobre la que nadie dijo nada. La diferencia importa porque el
// resultado se usa para decidir a quien llamar.
test('una cuenta sin descarte no esta descartada, y lo dice sin evidencia inventada', () => {
  seedEmpresa('de-limpia');

  const d = clasificarDescarte('de-limpia', 1, '2026-08-04');

  assert.equal(d.descartada, false);
  assert.equal(d.motivo, null);
  assert.equal(d.evidencia.valor, null);
  assert.equal(d.evidencia.quien, null);
});

test('un descarte se escribe con su motivo y su procedencia, y se devuelve releido', () => {
  seedEmpresa('de-simect');

  const r = marcarDescarte(
    { idEmpresa: 'de-simect', motivo: 'no_avanzo_tras_reunion', nota: 'tuvo reunion en junio y no volvio a contestar', ...QUIEN },
    1,
  );

  assert.equal(r.clasificacion.descartada, true);
  assert.equal(r.clasificacion.motivo, 'no_avanzo_tras_reunion');
  assert.equal(r.clasificacion.evidencia.quien, 'Sebastian Acosta Molina');
  assert.equal(r.clasificacion.evidencia.campo, 'motivo_descarte');
});

// El invariante. Sin fecha, "congelada" es un agujero: la cuenta sale de la lista y no hay nada
// que la devuelva. La regla del brain lo dice de la otra forma: un hold que cae al fondo de la
// columna es un hold que nadie vuelve a abrir.
test('una congelada sin fecha de retorno no se puede escribir', () => {
  seedEmpresa('de-sin-fecha');
  marcarDescarte({ idEmpresa: 'de-sin-fecha', motivo: 'ya_es_cliente', ...QUIEN }, 1);

  assert.throws(
    () => marcarDescarte({ idEmpresa: 'de-sin-fecha', motivo: 'congelada', ...QUIEN }, 1),
    /fechaRetorno/,
  );
});

// "Como fecha real, la cuenta sale sola y vuelve sola". Las dos mitades de esa frase, medidas
// contra el mismo dato en dos dias distintos.
test('una congelada vigente esta descartada; el dia que vence deja de estarlo, sin que nadie la toque', () => {
  seedEmpresa('de-congelada');
  marcarDescarte(
    { idEmpresa: 'de-congelada', motivo: 'congelada', fechaRetorno: '2026-10-01', nota: 'no antes de octubre', ...QUIEN },
    1,
  );

  const enAgosto = clasificarDescarte('de-congelada', 1, '2026-08-04');
  assert.equal(enAgosto.descartada, true);
  assert.equal(enAgosto.fechaRetorno, '2026-10-01');
  assert.equal(enAgosto.vigente, true);

  const enOctubre = clasificarDescarte('de-congelada', 1, '2026-10-01');
  assert.equal(enOctubre.descartada, false, 'el dia del retorno la cuenta vuelve sola');
  assert.equal(enOctubre.vigente, false);
  // El motivo NO se borra: la cuenta vuelve a la lista y el historial sigue diciendo que estuvo
  // congelada y hasta cuando. Borrarlo dejaria una cuenta que reaparece sin explicacion.
  assert.equal(enOctubre.motivo, 'congelada');
});

// Vencer no es escribir. Si el vencimiento limpiara la columna, la cuenta volveria a la lista sin
// rastro de por que se habia ido, y el proximo que la mire no sabria que ya se congelo una vez.
test('el vencimiento no escribe nada: la columna sigue diciendo que estuvo congelada', () => {
  clasificarDescarte('de-congelada', 1, '2026-12-31');

  const db = new Database(dbPath);
  const fila = db.prepare('SELECT motivo_descarte, fecha_retorno FROM empresa WHERE id_empresa = ?').get('de-congelada') as {
    motivo_descarte: string;
    fecha_retorno: string;
  };
  db.close();

  assert.deepEqual(fila, { motivo_descarte: 'congelada', fecha_retorno: '2026-10-01' });
});

// Los demas motivos no vencen: "ya es cliente" no deja de ser cierto el mes que viene. Solo la
// congelada tiene reloj, y por eso solo ella exige fecha.
test('un descarte que no es congelada no vence con el tiempo', () => {
  seedEmpresa('de-cliente');
  marcarDescarte({ idEmpresa: 'de-cliente', motivo: 'ya_es_cliente', nota: 'Servinet ya factura', ...QUIEN }, 1);

  const dentroDeUnAno = clasificarDescarte('de-cliente', 1, '2027-08-04');
  assert.equal(dentroDeUnAno.descartada, true);
  assert.equal(dentroDeUnAno.fechaRetorno, null);
});

test('un descarte se puede levantar, y queda el rastro de que se levanto', () => {
  seedEmpresa('de-error');
  marcarDescarte({ idEmpresa: 'de-error', motivo: 'otro_dueno', nota: 'decia FUP Felipe', ...QUIEN }, 1);
  assert.equal(clasificarDescarte('de-error', 1, '2026-08-04').descartada, true);

  marcarDescarte({ idEmpresa: 'de-error', motivo: null, nota: 'el proximo paso estaba mal, la cuenta es del operador', ...QUIEN }, 1);

  const despues = clasificarDescarte('de-error', 1, '2026-08-04');
  assert.equal(despues.descartada, false);
  assert.equal(despues.motivo, null);
});

test('un motivo fuera del vocabulario no entra', () => {
  seedEmpresa('de-mala');
  marcarDescarte({ idEmpresa: 'de-mala', motivo: 'no_califica', ...QUIEN }, 1);

  assert.throws(() => marcarDescarte({ idEmpresa: 'de-mala', motivo: 'no_me_gusto' as never, ...QUIEN }, 1));
});

test('un descarte sin quien lo dijo no entra', () => {
  seedEmpresa('de-sin-quien');
  marcarDescarte({ idEmpresa: 'de-sin-quien', motivo: 'no_califica', ...QUIEN }, 1);

  assert.throws(() => marcarDescarte({ idEmpresa: 'de-sin-quien', motivo: 'no_califica', fuente: 'operador' } as never, 1));
});
