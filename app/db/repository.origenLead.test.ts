// empresa.fuente_lead: de donde salio la cuenta (2026-08-05).
//
// La columna existe desde el 24-jul y NUNCA tuvo camino de escritura: verificado, ningun codigo la
// llena, asi que las 1.956 filas estan vacias. Es exactamente el patron que este repo ya sufrio con
// las tres columnas de transcript, que vivieron meses en la tabla sin que nada las llenara. Una
// columna sin accion que la escriba es una columna vacia para siempre.
//
// Sin ella no se puede responder lo que el operador pregunta: cuantas llamadas cuesta una reunion si
// la cuenta vino de un inbound contra si se prospecto en frio. El agregado esconde que no cuestan lo
// mismo, y con un solo numero no se puede decidir donde poner el tiempo.
//
// LA REGLA QUE ESTE ARCHIVO PROTEGE: una cuenta sin origen registrado NO es outbound. Es tentador
// asumirlo porque casi toda la prospeccion es fria, y ese atajo corrompe justo la medicion para la
// que la columna existe.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { marcarFuenteLead, origenDeLead, coberturaOrigenLead } = await import('./repository.ts');
const { FUENTES_LEAD } = await import('./validation.ts');

function seedEmpresa(id: string) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1)`,
  ).run(id, id, id);
  db.close();
}

const QUIEN = { procedencia: 'operador', quien: 'Sebastian Acosta Molina' };

test('el vocabulario son los cuatro origenes por los que entra una cuenta', () => {
  assert.deepEqual([...FUENTES_LEAD], ['inbound', 'outbound', 'evento', 'referido']);
});

// La prueba que sostiene toda la metrica. Si esto se rompe, la comparacion entre inbound y outbound
// pasa a estar calculada sobre un supuesto y deja de servir para decidir nada.
test('una cuenta sin origen registrado NO es outbound: es una cuenta que nadie marco', () => {
  seedEmpresa('ol-muda');

  const o = origenDeLead('ol-muda', 1);

  assert.equal(o.origen, null);
  assert.equal(o.registrado, false);
  assert.notEqual(o.origen, 'outbound', 'el silencio no se convierte en prospeccion fria');
  assert.equal(o.evidencia.quien, null, 'un silencio no puede traer procedencia');
});

test('marcarFuenteLead escribe el origen con su procedencia y lo devuelve releido', () => {
  seedEmpresa('ol-inbound');

  const r = marcarFuenteLead(
    { idEmpresa: 'ol-inbound', origen: 'inbound', nota: 'escribio por el formulario de la web', ...QUIEN },
    1,
  );

  assert.equal(r.clasificacion.origen, 'inbound');
  assert.equal(r.clasificacion.registrado, true);
  assert.equal(r.clasificacion.evidencia.campo, 'fuente_lead');
  assert.equal(r.clasificacion.evidencia.quien, 'Sebastian Acosta Molina');
  assert.match(r.clasificacion.evidencia.fecha ?? '', /^\d{4}-\d{2}-\d{2}$/);
});

// Misma regla de procedencia que aliado y descarte: un dato que despues nadie puede auditar no entra.
test('un origen sin quien lo dijo no entra', () => {
  seedEmpresa('ol-sin-quien');
  marcarFuenteLead({ idEmpresa: 'ol-sin-quien', origen: 'referido', ...QUIEN }, 1);

  assert.throws(() => marcarFuenteLead({ idEmpresa: 'ol-sin-quien', origen: 'referido', procedencia: 'notion' } as never, 1));
  assert.throws(() => marcarFuenteLead({ idEmpresa: 'ol-sin-quien', origen: 'referido', quien: 'Sebastian Acosta Molina' } as never, 1));
});

test('un origen fuera del vocabulario no entra', () => {
  seedEmpresa('ol-malo');
  marcarFuenteLead({ idEmpresa: 'ol-malo', origen: 'evento', ...QUIEN }, 1);

  assert.throws(() => marcarFuenteLead({ idEmpresa: 'ol-malo', origen: 'linkedin' as never, ...QUIEN }, 1));
});

// Corregir tiene que poder devolver la cuenta a "nadie lo sabe". Sin eso, un origen puesto por
// costumbre queda como si fuera un dato verificado y ensucia la comparacion para siempre.
test('un origen mal puesto se puede borrar y la cuenta vuelve a no tener registro', () => {
  seedEmpresa('ol-error');
  marcarFuenteLead({ idEmpresa: 'ol-error', origen: 'outbound', ...QUIEN }, 1);
  assert.equal(origenDeLead('ol-error', 1).registrado, true);

  marcarFuenteLead({ idEmpresa: 'ol-error', origen: null, nota: 'lo puse por costumbre, no se de donde salio', ...QUIEN }, 1);

  const despues = origenDeLead('ol-error', 1);
  assert.equal(despues.registrado, false);
  assert.equal(despues.origen, null);
  assert.equal(despues.evidencia.quien, null, 'al borrar el origen no queda procedencia colgando de nada');
});

// El numero que dice si la comparacion se puede leer. Sobre el 3% del pipeline, "inbound cierra
// mejor que outbound" es una frase sin respaldo, y la cobertura es lo unico que lo delata.
test('la cobertura dice sobre cuantas cuentas descansa cualquier comparacion por origen', () => {
  const c = coberturaOrigenLead(1);

  assert.equal(typeof c.conOrigen, 'number');
  assert.equal(typeof c.sinOrigen, 'number');
  assert.ok(c.conOrigen + c.sinOrigen > 0);
  assert.ok(c.sinOrigen >= 1, 'ol-muda nunca se marco');
});
