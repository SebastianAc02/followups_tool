import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaLeads, colaCierres, colaReagendar, colaDelDia } = await import('./repository.ts');

const OWNER = 'Sebastian Acosta Molina';
const OTRO_OWNER = 'Felipe Castro';

function seedEmpresa(
  id: string,
  owner: string,
  estadoNotion: string | null,
  proximoFollowUpFecha: string | null,
  idOrganizacion = 1,
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

// Regla de dominio (decision de Sebastian, 2026-07-15): 'lead' NO es un estado activo. Una
// fecha de follow-up vencida NO alcanza para meterlo en Toques -- esa columna se llena
// desde el seed de Notion y desde enriquecerDesdeNotion, no solo desde trabajo real, asi
// que "tiene fecha" no significa "la estoy trabajando". Un lead entra a Toques solo cuando
// esta en una SECUENCIA (inscripcion activa); si avanza a contacto_iniciado u otro estado,
// deja de ser lead y lo levantan las otras funciones del split.
//
// Por que aparecio ahora: hasta el 2026-07-15 estos leads tenian la fecha en formato humano
// de Notion ('June 12, 2026') y lte() los comparaba como TEXTO ('J' > '2' en ASCII), asi que
// nunca entraban. El fix de fechas (c9dc96d) los destapo: la cola de Sebastian paso de 4 a
// 15. Estaba "bien" por accidente -- esta regla nunca existio en el codigo.
test('colaLeads: un lead con fecha vencida pero SIN secuencia no entra a Toques', () => {
  seedEmpresa('l1', OWNER, 'lead', '2026-07-14'); // hoy, sin secuencia: NO entra
  seedEmpresa('l2', OWNER, 'lead', '2026-07-10'); // vencido, sin secuencia: NO entra
  seedEmpresa('l3', OWNER, 'lead', '2026-07-20'); // futuro: no entra
  seedEmpresa('l4', OWNER, 'lead', null); // sin fecha: no entra
  seedEmpresa('l5', OWNER, 'contacto_iniciado', '2026-07-10'); // otro estado: no entra
  seedEmpresa('l6', OTRO_OWNER, 'lead', '2026-07-10'); // otro owner: no entra

  const r = colaLeads('2026-07-14', OWNER, 1);
  assert.deepEqual(r.map((f) => f.id), [], 'un lead sin secuencia no es trabajo activo');
});

test('colaLeads: un lead EN secuencia con fecha vencida si entra a Toques', () => {
  seedEmpresa('ls1', OWNER, 'lead', '2026-07-10');
  seedInscripcionActiva('ls1', 'Campana viva');
  // Mismo lead, mismo estado, misma fecha: lo unico que cambia es que esta en una secuencia.
  seedEmpresa('ls2', OWNER, 'lead', '2026-07-10');

  const r = colaLeads('2026-07-14', OWNER, 1);
  assert.deepEqual(r.map((f) => f.id), ['ls1']);
});

test('colaLeads: una inscripcion NO activa no lo revive', () => {
  seedEmpresa('lp1', OWNER, 'lead', '2026-07-10');
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento) VALUES ('Pausada', 1, 1)`).run();
  const idCampana = (raw.prepare(`SELECT last_insert_rowid() id`).get() as { id: number }).id;
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, 'lp1', 'pausada')`).run(idCampana);
  raw.close();

  const r = colaLeads('2026-07-14', OWNER, 1);
  assert.equal(r.some((f) => f.id === 'lp1'), false, 'pausada por respuesta detectada = ya no se le escribe');
});

test('colaCierres: estados calientes del owner, con y sin fecha, sin nocion de vencido', () => {
  // Organizacion 2, aislada: c6 (reunion_agendada + no_llego) tambien cumple el criterio
  // de colaReagendar, que corre en organizacion 1 en otro test de este mismo archivo (sin
  // limpieza entre tests, mismo problema documentado en repository.contarPorEstado.test.ts).
  seedEmpresa('c1', OWNER, 'oportunidad', '2026-07-10', 2); // vencido segun fecha: igual entra
  seedEmpresa('c2', OWNER, 'cierre_documentacion', null, 2); // sin fecha: igual entra
  seedEmpresa('c3', OWNER, 'reunion_agendada', '2026-08-01', 2); // futuro, sin toque: igual entra
  seedEmpresa('c4', OWNER, 'lead', '2026-07-10', 2); // no es estado caliente: no entra
  seedEmpresa('c5', OTRO_OWNER, 'oportunidad', '2026-07-10', 2); // otro owner: no entra

  seedEmpresa('c6', OWNER, 'reunion_agendada', '2026-07-10', 2);
  seedToque('c6', 'no_llego'); // no-show pendiente: se va a Reagendar, no entra aqui

  seedEmpresa('c7', OWNER, 'oportunidad', '2026-07-10', 2);
  seedToque('c7', 'no_llego'); // no_llego pero NO es reunion_agendada: si entra (la exclusion es solo para reunion_agendada)

  const r = colaCierres(OWNER, 2);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['c1', 'c2', 'c3', 'c7']);
});

test('colaReagendar: reunion_agendada cuyo ultimo toque fue no_llego, vencido o de hoy', () => {
  seedEmpresa('r1', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r1', 'no_llego'); // vencido + no_llego: entra

  seedEmpresa('r2', OWNER, 'reunion_agendada', '2026-07-14');
  seedToque('r2', 'no_llego'); // hoy + no_llego: entra

  seedEmpresa('r3', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r3', 'contesto_reunion'); // vencido pero ultimo resultado NO es no_llego: no entra

  seedEmpresa('r4', OWNER, 'reunion_agendada', '2026-07-10'); // sin ningun toque: no entra
  seedEmpresa('r5', OWNER, 'oportunidad', '2026-07-10');
  seedToque('r5', 'no_llego'); // no_llego pero no es reunion_agendada: no entra

  seedEmpresa('r6', OWNER, 'reunion_agendada', '2026-07-20');
  seedToque('r6', 'no_llego'); // no_llego pero fecha futura: no entra

  seedEmpresa('r7', OTRO_OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r7', 'no_llego'); // otro owner: no entra

  // r8: dos toques, el mas reciente NO es no_llego -- se reagendo con exito, ya no cuenta.
  seedEmpresa('r8', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r8', 'no_llego');
  seedToque('r8', 'contesto_reunion');

  const r = colaReagendar('2026-07-14', OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['r1', 'r2']);
});

test('colaDelDia: excluye on_hold y firma_pago; conserva otros estados y estado null', () => {
  // Organizacion 4, aislada de los demas tests de este archivo. Todas vencidas o de hoy,
  // asi que todas calificarian por fecha -- el filtro que se prueba es el de estado.
  seedEmpresa('d1', OWNER, 'lead', '2026-07-10', 4); // lead: entra
  seedEmpresa('d2', OWNER, 'on_hold', '2026-07-10', 4); // durmiente: NO entra
  seedEmpresa('d3', OWNER, 'firma_pago', '2026-07-10', 4); // ya cliente: NO entra
  seedEmpresa('d4', OWNER, 'contacto_iniciado', '2026-07-10', 4); // otro estado: entra
  seedEmpresa('d5', OWNER, null, '2026-07-10', 4); // estado null: entra (COALESCE)

  const r = colaDelDia('2026-07-14', OWNER, 4);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['d1', 'd4', 'd5']);
});

test('colaLeads/colaCierres/colaReagendar: campana viene poblada solo si hay inscripcion activa', () => {
  seedEmpresa('m1', OWNER, 'lead', '2026-07-10', 3);
  seedInscripcionActiva('m1', 'Reactivacion express');
  // Sin inscripcion ya no entra a colaLeads (un lead sin secuencia no es trabajo activo,
  // ver los tests de arriba), asi que el caso "campana null" se cubre donde SI puede pasar:
  // colaCierres no exige secuencia -- una cuenta caliente es trabajo real por si sola.
  seedEmpresa('m2', OWNER, 'oportunidad', '2026-07-10', 3);

  const r = colaLeads('2026-07-14', OWNER, 3);
  assert.deepEqual(r.map((f) => f.id), ['m1'], 'solo el lead con secuencia');
  assert.equal(r[0]?.campana, 'Reactivacion express');

  const cierres = colaCierres(OWNER, 3);
  assert.equal(cierres.find((f) => f.id === 'm2')?.campana, null, 'sin inscripcion, campana null');
});
