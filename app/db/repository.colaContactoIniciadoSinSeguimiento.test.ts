import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaContactoIniciadoSinSeguimiento } = await import('./repository.ts');

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

function seedInscripcionActiva(idEmpresa: string, nombreCampana: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento) VALUES (?, 1, 1)`).run(nombreCampana);
  const idCampana = (raw.prepare(`SELECT last_insert_rowid() id`).get() as { id: number }).id;
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`).run(idCampana, idEmpresa);
  raw.close();
}

test('colaContactoIniciadoSinSeguimiento: contacto_iniciado, sin fecha, sin inscripcion activa, del owner pedido', () => {
  seedEmpresa('s1', OWNER, 'contacto_iniciado', null); // cumple todo: entra
  seedEmpresa('s2', OWNER, 'contacto_iniciado', '2026-07-20'); // tiene fecha: no entra (ya la cubre la cola normal)
  seedEmpresa('s3', OWNER, 'lead', null); // otro estado: no entra
  seedEmpresa('s4', OTRO_OWNER, 'contacto_iniciado', null); // otro owner: no entra

  seedEmpresa('s5', OWNER, 'contacto_iniciado', null);
  seedInscripcionActiva('s5', 'Reactivacion express'); // inscripcion activa: no entra

  const r = colaContactoIniciadoSinSeguimiento(OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['s1']);
});

// Fase 3 (CRO, docs/plan-produccion-cro-campana.md): sin owner, la funcion trae la
// seccion de TODOS los owners de la organizacion -- es lo que necesita Camilo para ver
// Felipe + Sebastian juntos. El caller (pagina) decide cuando pedir esto; el Repository
// solo sabe "con owner filtra, sin owner trae todo" (mismo patron que colaDelDia).
// Organizacion 5, aislada del resto de este archivo (sin limpieza entre tests, mismo
// problema documentado en repository.contadoresHoy.test.ts).
test('colaContactoIniciadoSinSeguimiento: sin owner (CRO) trae la seccion de TODOS los owners de la organizacion', () => {
  seedEmpresa('cro1', OWNER, 'contacto_iniciado', null, 5);
  seedEmpresa('cro2', OTRO_OWNER, 'contacto_iniciado', null, 5);

  const r = colaContactoIniciadoSinSeguimiento(undefined, 5);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['cro1', 'cro2'], 've las de ambos owners, no solo uno');
});
