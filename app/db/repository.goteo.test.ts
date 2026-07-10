// Task 8.3: enrollment escalonado por goteo de ingreso. inscribirCampana ya no mete
// a todas las empresas del segmento el dia 1 -- programa fechaInscripcion segun el
// goteo (calcularGoteo), respetando el orden del segmento y excluyendo del reparto a
// las que quedan 'bloqueada' (no consumen cupo de ningun dia).
// Fecha de referencia: 2026-07-07 martes (habil), 2026-07-11/12 fin de semana.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, guardarSegmento, crearCampana, inscribirCampana, historialInscripciones, guardarProveedorCampanaId, campanaParaLanzar } = await import('./repository.ts');

const MARTES = '2026-07-07';

// Seed: 5 empresas en el orden e1..e5 (el orden de insercion es el orden que trae el
// segmento, empresasDeSegmentoGuardado no reordena). e3 nace sin ningun contacto con
// canal -> bloqueada, no debe consumir cupo del goteo.
function seed() {
  const raw = new Database(dbPath);
  const emp = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'isp')`,
  );
  const con = raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente)
     VALUES (?, ?, ?, ?, ?, 'seed')`,
  );
  for (const id of ['e1', 'e2', 'e3', 'e4', 'e5']) {
    emp.run(id, id, id);
  }
  con.run('e1', 'C1', 0, 1, 'c1@x.com');
  con.run('e2', 'C2', 0, 1, 'c2@x.com');
  // e3: sin email ni telefono -> sin destinatario -> bloqueada
  con.run('e3', 'C3', 0, 1, null);
  con.run('e4', 'C4', 0, 1, 'c4@x.com');
  con.run('e5', 'C5', 0, 1, 'c5@x.com');
  raw.close();
}
seed();

const idCadencia = crearCadencia({ nombre: 'C', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
const idSegmento = guardarSegmento({ nombre: 'goteo', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);

test('goteo programa fechaInscripcion por dia segun el orden del segmento, y la bloqueada no consume cupo', () => {
  // intake 2/dia, ritmo diario, arranca el martes 2026-07-07.
  const idCampana = crearCampana({
    nombre: 'Camp goteo',
    idCadencia,
    idSegmento,
    intakeDiario: 2,
    ritmoIngreso: 'diario',
    fechaInicio: MARTES,
  });

  const res = inscribirCampana(idCampana, 1);

  // e3 (sin canal) queda bloqueada; las otras 4 son elegibles.
  assert.equal(res.bloqueadas, 1);
  assert.equal(res.inscritas, 4);

  const fecha = (idEmpresa: string) => historialInscripciones(idEmpresa)[0].fechaInscripcion?.slice(0, 10);

  // Orden del segmento: e1, e2, e3(bloqueada, fuera del reparto), e4, e5.
  // Con 2/dia: posicion 0,1 -> dia1 (martes 07-07); posicion 2,3 -> dia2 (miercoles 07-08).
  // e3 no ocupa ninguna posicion del reparto -- si consumiera cupo, e5 caeria en el dia3.
  assert.equal(fecha('e1'), '2026-07-07');
  assert.equal(fecha('e2'), '2026-07-07');
  assert.equal(fecha('e4'), '2026-07-08');
  assert.equal(fecha('e5'), '2026-07-08');

  // La bloqueada no tiene fecha de goteo asignada (cae al fallback de "ahora"), pero lo
  // relevante de este test es que no desplazo a e5 a un tercer dia.
  const hE3 = historialInscripciones('e3');
  assert.equal(hE3[0].estado, 'bloqueada');
});

test('sin intakeDiario, todas las elegibles entran el mismo dia (comportamiento previo preservado)', () => {
  const idSegmento2 = guardarSegmento({ nombre: 'goteo-sin-intake', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp sin intake', idCadencia, idSegmento: idSegmento2, fechaInicio: MARTES });

  inscribirCampana(idCampana, 1);

  const fecha = (idEmpresa: string) => historialInscripciones(idEmpresa).find((h) => h.idCampana === idCampana)?.fechaInscripcion?.slice(0, 10);
  assert.equal(fecha('e1'), '2026-07-07');
  assert.equal(fecha('e2'), '2026-07-07');
  assert.equal(fecha('e4'), '2026-07-07');
  assert.equal(fecha('e5'), '2026-07-07');
});

// Lanzar (pedido puntual de Sebastian): guardarProveedorCampanaId persiste el id de la
// secuencia externa de Apollo y se puede releer via campanaParaLanzar. El flujo completo
// de lanzarCampanaAction llamando al adaptador real de Apollo no tiene inyeccion de
// dependencias (crea crearApolloAdapter() directo) -- ese camino se prueba manualmente
// contra la cuenta real, no aca.
test('guardarProveedorCampanaId persiste el id de la secuencia externa y se puede leer de vuelta', () => {
  const idSegmento3 = guardarSegmento({ nombre: 'goteo-proveedor', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp proveedor', idCadencia, idSegmento: idSegmento3, fechaInicio: MARTES });

  guardarProveedorCampanaId(idCampana, 'apollo-seq-123');

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT proveedor_campana_id FROM campana WHERE id_campana = ?').get(idCampana) as { proveedor_campana_id: string };
  raw.close();
  assert.equal(fila.proveedor_campana_id, 'apollo-seq-123');

  // campanaParaLanzar no expone proveedorCampanaId hoy (no lo necesita la pantalla de
  // Lanzar); se verifica que la campana sigue siendo legible sin romperse tras el UPDATE.
  const camp = campanaParaLanzar(idCampana, 1);
  assert.equal(camp?.nombre, 'Camp proveedor');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
