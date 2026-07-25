// "Cada quien ve SUS cuentas" en /seguimiento. La regla existia desde el 2026-07-15 pero solo
// estaba implementada en pipelineSinCadencia: kpisPipeline, pipelineGlobal y
// empresasConRespuestaPendiente ni siquiera aceptaban owner, asi que a Felipe le salian las
// cuentas de Sebastian (el caso concreto que lo destapo: "Mundo Mas", cuyo owner es Sebastian,
// aparecia en la pantalla de Felipe).
//
// Los dos lados importan igual: con owner se filtra, y SIN owner NO se filtra, porque ese es el
// modo CRO (verTodoPipeline) y romperlo escondería cuentas a quien tiene que verlas todas.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { kpisPipeline, pipelineGlobal, empresasConRespuestaPendiente, registrarRespuestaDetectada } =
  await import('./repository.ts');

const ORG = 6601;
const HOY = '2026-07-25';

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, owner: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'lead', 'lead', ?, ?)`,
  ).run(id, id, id, ORG, owner);
  db.close();
}

function seedCampanaConInscripcion(idCampana: number, idInscripcion: number, idEmpresa: string) {
  const db = raw();
  // NADA de INSERT OR IGNORE aca: se traga en silencio una violacion de NOT NULL y el test
  // termina fallando con "0 !== 1" en vez de decir que el seed no existio. id_cadencia e
  // id_segmento son NOT NULL en campana.
  const yaExiste = db.prepare('SELECT 1 AS x FROM campana WHERE id_campana = ?').get(idCampana);
  if (!yaExiste) {
    db.prepare(
      `INSERT INTO campana (id_campana, id_organizacion, nombre, id_cadencia, id_segmento, estado, created_at)
       VALUES (?, ?, ?, 1, 1, 'activa', ?)`,
    ).run(idCampana, ORG, `campana-${idCampana}`, HOY);
  }
  db.prepare(
    `INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado, fecha_inscripcion)
     VALUES (?, ?, ?, 'activa', ?)`,
  ).run(idInscripcion, idCampana, idEmpresa, HOY);
  db.close();
}

seedEmpresa('own-felipe', 'Felipe Castro');
seedEmpresa('own-sebas', 'Sebastian Acosta Molina');
seedCampanaConInscripcion(9601, 9611, 'own-felipe');
seedCampanaConInscripcion(9601, 9612, 'own-sebas');

test('kpisPipeline con owner cuenta solo la cartera de esa persona', () => {
  const felipe = kpisPipeline(ORG, HOY, 'Felipe Castro');
  const sebas = kpisPipeline(ORG, HOY, 'Sebastian Acosta Molina');
  assert.equal(felipe.enSecuencia, 1);
  assert.equal(sebas.enSecuencia, 1);
});

// El modo CRO. Si esto se cae, alguien le escondio cuentas a quien tiene que verlas todas.
test('kpisPipeline SIN owner sigue contando el pipeline entero', () => {
  const todos = kpisPipeline(ORG, HOY);
  assert.equal(todos.enSecuencia, 2);
});

test('pipelineGlobal con owner deja fuera las cuentas de los demas', () => {
  const felipe = pipelineGlobal(ORG, HOY, undefined, 'Felipe Castro');
  assert.deepEqual(felipe.map((f) => f.idEmpresa).sort(), ['own-felipe']);
  assert.equal(
    felipe.some((f) => f.idEmpresa === 'own-sebas'),
    false,
    'el caso Mundo Mas: una cuenta de Sebastian no puede salir en la pantalla de Felipe',
  );
});

test('pipelineGlobal SIN owner sigue trayendo a todos', () => {
  const todos = pipelineGlobal(ORG, HOY);
  assert.deepEqual(todos.map((f) => f.idEmpresa).sort(), ['own-felipe', 'own-sebas']);
});

test('empresasConRespuestaPendiente con owner solo trae las respuestas de esa cartera', () => {
  registrarRespuestaDetectada(9611, 'own-felipe', 'correo');
  registrarRespuestaDetectada(9612, 'own-sebas', 'whatsapp');

  const felipe = empresasConRespuestaPendiente(ORG, 'Felipe Castro');
  assert.deepEqual(felipe.map((f) => f.idEmpresa).sort(), ['own-felipe']);

  const todos = empresasConRespuestaPendiente(ORG);
  assert.deepEqual(todos.map((f) => f.idEmpresa).sort(), ['own-felipe', 'own-sebas']);
});

// Los owners compartidos ("Felipe Castro, Thomas Schumacher") son texto libre y NO matchean por
// igualdad. Es un limite conocido, no un descuido: hay 2 filas asi en la base real. Se deja
// escrito para que quien lo cambie sepa que esta cambiando algo, no arreglando un bug.
test('un owner compartido no entra por igualdad exacta, y eso es sabido', () => {
  seedEmpresa('own-compartido', 'Felipe Castro, Thomas Schumacher');
  seedCampanaConInscripcion(9601, 9613, 'own-compartido');
  const felipe = pipelineGlobal(ORG, HOY, undefined, 'Felipe Castro');
  assert.equal(felipe.some((f) => f.idEmpresa === 'own-compartido'), false);
});

test.after(() => borrarDbPrueba(dbPath));
