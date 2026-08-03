// Toques = lo que de verdad esta pendiente HOY (2026-08-03).
//
// Medido contra produccion ese dia: la pantalla listaba 66 filas y la tarjeta decia 62 para
// hoy, con 43 pasos de cadencia de cuentas en on_hold arriba de todo. Dos de las causas eran
// de fecha: colaCierres no filtraba por fecha (traia futuras y sin fecha, y por eso el
// contador no podia llegar a cero) y no habia por donde ver lo que quedaba afuera.
//
// La regla que se prueba aca: una cuenta entra a la cola del dia si tiene proximo paso con
// fecha vencida o de hoy y es del owner. Lo demas NO desaparece, cae en su propia consulta:
//   - fecha futura            -> colaProgramadas (lo que viene, no es de hoy)
//   - sin fecha               -> colaSinProximoPaso (falta decidir el siguiente movimiento)
// Las cuatro consultas de estados calientes (colaCierres, colaReagendar, colaProgramadas,
// colaSinProximoPaso) parten el conjunto: cada cuenta caliente del owner cae en UNA y solo
// una. El ultimo test de este archivo lo verifica, y es el que impide un descarte silencioso.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaCierres, colaReagendar, colaSinProximoPaso, colaProgramadas } = await import('./repository.ts');

const OWNER = 'Sebastian Acosta Molina';
const OTRO_OWNER = 'Felipe Castro';
const HOY = '2026-08-03';

function seedEmpresa(
  id: string,
  owner: string,
  estadoNotion: string | null,
  proximoFollowUpFecha: string | null,
  idOrganizacion: number,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
    )
    .run(id, id, id, owner, estadoNotion, proximoFollowUpFecha, idOrganizacion);
  raw.close();
}

function seedToque(idEmpresa: string, resultado: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO toque (id_empresa, resultado, fuente) VALUES (?, ?, 'cockpit')`).run(idEmpresa, resultado);
  raw.close();
}

function seedInscripcionActiva(idEmpresa: string, nombreCampana: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento) VALUES (?, 1, 1)`).run(nombreCampana);
  const idCampana = (raw.prepare(`SELECT last_insert_rowid() id`).get() as { id: number }).id;
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`).run(idCampana, idEmpresa);
  raw.close();
}

// Organizacion 11: aislada del resto (los tests de este repo no limpian entre casos, mismo
// problema documentado en repository.contarPorEstado.test.ts).
test('colaCierres: solo estados calientes con fecha vencida o de hoy', () => {
  seedEmpresa('f1', OWNER, 'oportunidad', '2026-07-28', 11); // vencida: entra
  seedEmpresa('f2', OWNER, 'cierre_documentacion', HOY, 11); // de hoy: entra
  seedEmpresa('f3', OWNER, 'enviar_contrato', '2026-08-10', 11); // futura: NO entra (colaProgramadas)
  seedEmpresa('f4', OWNER, 'oportunidad', null, 11); // sin fecha: NO entra (colaSinProximoPaso)
  seedEmpresa('f5', OWNER, 'contacto_iniciado', '2026-07-28', 11); // no es caliente: otra consulta
  seedEmpresa('f6', OTRO_OWNER, 'oportunidad', '2026-07-28', 11); // otro owner: NO entra
  seedEmpresa('f7', OWNER, 'reunion_agendada', '2026-07-28', 11);
  seedToque('f7', 'no_llego'); // no-show pendiente: sale por colaReagendar, no aca

  assert.deepEqual(
    colaCierres(HOY, OWNER, 11)
      .map((f) => f.id)
      .sort(),
    ['f1', 'f2'],
  );
});

test('colaSinProximoPaso: los calientes SIN fecha, que son los que no tienen siguiente movimiento decidido', () => {
  seedEmpresa('n1', OWNER, 'oportunidad', null, 12); // entra
  seedEmpresa('n2', OWNER, 'reunion_agendada', null, 12);
  seedToque('n2', 'no_llego'); // no-show que nadie reagendo: entra (colaReagendar exige fecha)
  seedEmpresa('n3', OWNER, 'cierre_documentacion', '2026-07-28', 12); // tiene fecha: no entra
  seedEmpresa('n4', OWNER, 'contacto_iniciado', null, 12); // no es caliente: lo cubre colaContactoIniciadoSinSeguimiento
  seedEmpresa('n5', OWNER, 'on_hold', null, 12); // dormido: nunca
  seedEmpresa('n6', OTRO_OWNER, 'oportunidad', null, 12); // otro owner: no entra

  assert.deepEqual(
    colaSinProximoPaso(OWNER, 12)
      .map((f) => f.id)
      .sort(),
    ['n1', 'n2'],
  );
});

test('colaProgramadas: lo que tiene fecha futura, calientes y contacto_iniciado sin cadencia', () => {
  seedEmpresa('p1', OWNER, 'oportunidad', '2026-08-10', 13); // caliente futuro: entra
  seedEmpresa('p2', OWNER, 'contacto_iniciado', '2026-08-05', 13); // contactado futuro sin cadencia: entra
  seedEmpresa('p3', OWNER, 'contacto_iniciado', '2026-08-05', 13);
  seedInscripcionActiva('p3', 'Precio ISPs A'); // con cadencia: su paso ya sale por su bucket
  seedEmpresa('p4', OWNER, 'oportunidad', HOY, 13); // de hoy: es cola, no programada
  seedEmpresa('p5', OWNER, 'on_hold', '2026-08-10', 13); // on_hold nunca entra a esta pantalla
  seedEmpresa('p6', OWNER, 'lead', '2026-08-10', 13); // lead dormido: fuera
  seedEmpresa('p7', OTRO_OWNER, 'oportunidad', '2026-08-10', 13); // otro owner: no entra

  assert.deepEqual(
    colaProgramadas(HOY, OWNER, 13)
      .map((f) => f.id)
      .sort(),
    ['p1', 'p2'],
  );
});

// El test que impide el descarte silencioso: si mañana alguien aprieta un filtro de mas, una
// cuenta caliente se cae de las cuatro consultas y este assert lo canta.
test('particion: toda cuenta caliente del owner cae en exactamente una de las cuatro consultas', () => {
  const ORG = 14;
  const calientes = [
    ['q1', 'oportunidad', '2026-07-28'], // vencida
    ['q2', 'oportunidad', HOY], // de hoy
    ['q3', 'oportunidad', '2026-08-10'], // futura
    ['q4', 'oportunidad', null], // sin fecha
    ['q5', 'reunion_agendada', '2026-07-28'], // no-show vencido
    ['q6', 'reunion_agendada', null], // no-show sin fecha
    ['q7', 'reunion_agendada', '2026-08-10'], // no-show futuro
    ['q8', 'enviar_contrato', '2026-07-28'],
    ['q9', 'cierre_documentacion', null],
  ] as const;
  for (const [id, estado, fecha] of calientes) seedEmpresa(id, OWNER, estado, fecha, ORG);
  for (const id of ['q5', 'q6', 'q7']) seedToque(id, 'no_llego');

  const cubos = {
    cola: colaCierres(HOY, OWNER, ORG).map((f) => f.id),
    reagendar: colaReagendar(HOY, OWNER, ORG).map((f) => f.id),
    programadas: colaProgramadas(HOY, OWNER, ORG).map((f) => f.id),
    sinProximoPaso: colaSinProximoPaso(OWNER, ORG).map((f) => f.id),
  };

  for (const [id] of calientes) {
    const donde = Object.entries(cubos)
      .filter(([, ids]) => ids.includes(id))
      .map(([nombre]) => nombre);
    assert.deepEqual(donde.length, 1, `${id} deberia caer en exactamente un cubo, cayo en [${donde.join(', ')}]`);
  }

  assert.deepEqual(cubos.cola.sort(), ['q1', 'q2', 'q8'], 'la cola del dia: vencidas y de hoy');
  assert.deepEqual(cubos.reagendar.sort(), ['q5'], 'el no-show con fecha llegada');
  assert.deepEqual(cubos.programadas.sort(), ['q3', 'q7'], 'lo que viene');
  assert.deepEqual(cubos.sinProximoPaso.sort(), ['q4', 'q6', 'q9'], 'lo que no tiene siguiente movimiento');
});
