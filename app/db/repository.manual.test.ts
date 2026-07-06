// V5.6: manual email Tier 1 + freno manual. El paso manual es un FLAG del paso
// (paso_cadencia.es_manual), no una rama de codigo: nunca lo dispara el push
// automatico (V5.4), sin importar cuantos dias pasen, y al aprobarlo la fecha REAL
// de envio (no la programada) es la que alimenta el re-anclaje del motor (V4.6).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';
import { proximoPasoDebido } from '../core/motor-cadencia.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  destinatariosDeInscripcion,
  historialInscripciones,
  crearPasoInscripcionPendiente,
  pasoInscripcionesPendientes,
  pasosManualesPendientes,
  aprobarPasoManual,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, categoria: string, email: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES (?, 'Contacto', 0, 1, ?, 'seed')`,
  ).run(id, email);
  db.close();
}

function fijarProveedorCampanaId(idCampana: number, id: string) {
  const db = raw();
  db.prepare('UPDATE campana SET proveedor_campana_id = ? WHERE id_campana = ?').run(id, idCampana);
  db.close();
}

function idsDePaso(idCadencia: number, orden: number) {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ? AND orden = ?').get(idCadencia, orden) as any;
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as any;
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

seedEmpresa('e-manual-1', 'manual-cat-1', 'ana@empresa.com');

// Paso 1: manual (llamada Tier 1). Paso 2: automatico, 3 dias despues.
const idCadencia = crearCadencia({
  nombre: 'C manual',
  pasos: [
    { orden: 1, diaOffset: 0, canal: 'llamada', objetivo: 'Tier 1', esManual: true },
    { orden: 2, diaOffset: 3, canal: 'correo', asunto: 'Seguimiento', cuerpo: 'x' },
  ],
});
const idSegmento = guardarSegmento({ nombre: 'manual-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['manual-cat-1'] }] } });

const idCampana = crearCampana({ nombre: 'Camp manual', idCadencia, idSegmento });
fijarProveedorCampanaId(idCampana, 'seq-manual-1');
inscribirCampana(idCampana);

const idInscripcion = historialInscripciones('e-manual-1').find((i) => i.estado === 'activa')!.id;
const idDestinatario = destinatariosDeInscripcion(idInscripcion)[0].id;
const { idPaso: idPaso1, idVersion: idVersion1 } = idsDePaso(idCadencia, 1);
const { idPaso: idPaso2 } = idsDePaso(idCadencia, 2);

const idPasoInscripcion1 = crearPasoInscripcionPendiente({ idDestinatario, idPaso: idPaso1, idVersion: idVersion1, canal: 'llamada' });

test('un paso manual NUNCA aparece en pasoInscripcionesPendientes (push automatico), sin importar la fecha', () => {
  const pendientesPush = pasoInscripcionesPendientes('2099-01-01T00:00:00.000Z'); // muy en el futuro: "3 dias despues" y mas
  assert.ok(!pendientesPush.some((f) => f.idPasoInscripcion === idPasoInscripcion1), 'el push automatico jamas lo toca');
});

test('un paso manual SI aparece en la cola de revision (pasosManualesPendientes)', () => {
  const manuales = pasosManualesPendientes();
  const fila = manuales.find((f) => f.idPasoInscripcion === idPasoInscripcion1);
  assert.ok(fila);
  assert.strictEqual(fila!.email, 'ana@empresa.com');
  assert.strictEqual(fila!.canal, 'llamada');
});

test('aprobar el manual con la fecha REAL lo saca de la cola de revision', () => {
  aprobarPasoManual(idPasoInscripcion1, '2026-07-09T15:00:00.000Z'); // aprobado 3 dias tarde de lo programado

  const manuales = pasosManualesPendientes();
  assert.ok(!manuales.some((f) => f.idPasoInscripcion === idPasoInscripcion1));

  const db = raw();
  const fila = db.prepare('SELECT estado, proveedor, fecha_enviada FROM paso_inscripcion WHERE id_paso_inscripcion = ?').get(idPasoInscripcion1) as any;
  db.close();
  assert.strictEqual(fila.estado, 'enviada');
  assert.strictEqual(fila.proveedor, 'manual');
  assert.strictEqual(fila.fecha_enviada, '2026-07-09T15:00:00.000Z');
});

test('el motor re-ancla el paso 2 desde la fecha REAL de aprobacion, no desde la programada original', () => {
  // Paso 2 estaba programado a dia_offset=3 desde el anchor original (dia 0). Si el
  // motor usara la fecha programada original, el paso 2 seria fijo; con re-anclaje
  // (V4.6), se mide desde la fecha REAL en que el paso 1 se aprobo (2026-07-09).
  const pasos = [
    { orden: 1, diaOffset: 0 },
    { orden: 2, diaOffset: 3 },
  ];
  const ejecutados = [{ orden: 1, fechaReal: '2026-07-09' }]; // la fecha real que acabamos de grabar (sin hora)
  const config = { diasBloqueados: [], corrimiento: 'siguiente' as const };

  // Un dia despues de la aprobacion real, el paso 2 (offset +3 desde el 09) todavia
  // NO deberia estar debido.
  assert.strictEqual(proximoPasoDebido(pasos, { anchor: '2026-07-06', ejecutados }, '2026-07-10', config), null);

  // Al llegar el dia 3 desde la fecha REAL (2026-07-12), el motor lo marca debido.
  const debido = proximoPasoDebido(pasos, { anchor: '2026-07-06', ejecutados }, '2026-07-12', config);
  assert.ok(debido);
  assert.strictEqual(debido!.orden, 2);
  assert.strictEqual(debido!.fechaObjetivo, '2026-07-12');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
