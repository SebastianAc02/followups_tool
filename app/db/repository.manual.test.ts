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
  marcarPasoInscripcionCompletadaManual,
  registrarToque,
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
const idSegmento = guardarSegmento({ nombre: 'manual-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['manual-cat-1'] }] } }, 1);

const idCampana = crearCampana({ nombre: 'Camp manual', idCadencia, idSegmento });
fijarProveedorCampanaId(idCampana, 'seq-manual-1');
inscribirCampana(idCampana);

const idInscripcion = historialInscripciones('e-manual-1').find((i) => i.estado === 'activa')!.id;
const idDestinatario = destinatariosDeInscripcion(idInscripcion)[0].id;
const { idPaso: idPaso1, idVersion: idVersion1 } = idsDePaso(idCadencia, 1);
const { idPaso: idPaso2 } = idsDePaso(idCadencia, 2);

const idPasoInscripcion1 = crearPasoInscripcionPendiente({ idDestinatario, idPaso: idPaso1, idVersion: idVersion1, canal: 'llamada' });

test('un paso manual NUNCA aparece en pasoInscripcionesPendientes (push automatico), sin importar la fecha', () => {
  const pendientesPush = pasoInscripcionesPendientes('llamada', '2099-01-01T00:00:00.000Z'); // muy en el futuro: "3 dias despues" y mas
  assert.ok(!pendientesPush.some((f) => f.idPasoInscripcion === idPasoInscripcion1), 'el push automatico jamas lo toca');
});

// Sesion 2026-07-09: llamada ya NO pasa por "Por revisar" -- una llamada no tiene un
// texto que aprobar, tiene un resultado real (una de las 4 salidas cerradas) que solo
// se captura en el cockpit de /llamada. aprobarPasoManual (usado por correo/whatsapp)
// dejaria un toque SIN resultado, asi que llamada se cierra distinto: ver
// marcarPasoInscripcionCompletadaManual, llamada desde registrarToqueAction despues
// de que registrarToque ya guardo el toque completo.
test('un paso manual de llamada NO aparece en pasosManualesPendientes (no es Tier 1 de texto)', () => {
  const manuales = pasosManualesPendientes();
  assert.ok(!manuales.some((f) => f.idPasoInscripcion === idPasoInscripcion1));
});

test('registrar el toque real + marcarPasoInscripcionCompletadaManual cierra el paso de llamada con su resultado', () => {
  registrarToque({ idEmpresa: 'e-manual-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'Hablamos de precio' }, 1);
  marcarPasoInscripcionCompletadaManual(idPasoInscripcion1, '2026-07-09T15:00:00.000Z');

  const db = raw();
  const fila = db.prepare('SELECT estado, proveedor, fecha_enviada FROM paso_inscripcion WHERE id_paso_inscripcion = ?').get(idPasoInscripcion1) as any;
  assert.strictEqual(fila.estado, 'enviada');
  assert.strictEqual(fila.proveedor, 'manual');
  assert.strictEqual(fila.fecha_enviada, '2026-07-09T15:00:00.000Z');

  // a diferencia de aprobarPasoManual, el toque SI trae resultado (registrarToque lo exige).
  const toques = db.prepare('SELECT canal, resultado, que_paso FROM toque WHERE id_empresa = ?').all('e-manual-1') as any[];
  db.close();
  assert.equal(toques.length, 1);
  assert.equal(toques[0].canal, 'llamada');
  assert.equal(toques[0].resultado, 'contesto_sigue_seguimiento');
  assert.equal(toques[0].que_paso, 'Hablamos de precio');
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

// Parte 4 campanas: aprobar un manual con cuerpoFinal (el texto que Sebastian
// personalizo antes de mandarlo el mismo) deja un toque en el historial de la
// empresa -- antes aprobar solo tocaba paso_inscripcion, sin dejar rastro en toque.
seedEmpresa('e-manual-2', 'manual-cat-2', 'beto@empresa.com');
const idCadencia2 = crearCadencia({
  nombre: 'C manual con copy',
  pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola [nombre]', cuerpo: 'Cuerpo [nombre].', esManual: true }],
});
const idSegmento2 = guardarSegmento({ nombre: 'manual-seg-2', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['manual-cat-2'] }] } }, 1);
const idCampana2 = crearCampana({ nombre: 'Camp manual 2', idCadencia: idCadencia2, idSegmento: idSegmento2 });
inscribirCampana(idCampana2);
const idInscripcion2 = historialInscripciones('e-manual-2').find((i) => i.estado === 'activa')!.id;
const idDestinatario2 = destinatariosDeInscripcion(idInscripcion2)[0].id;
const { idPaso: idPaso2b, idVersion: idVersion2b } = idsDePaso(idCadencia2, 1);
const idPasoInscripcion2 = crearPasoInscripcionPendiente({ idDestinatario: idDestinatario2, idPaso: idPaso2b, idVersion: idVersion2b, canal: 'correo' });

test('aprobar un manual con cuerpoFinal deja un toque en el historial de la empresa', () => {
  aprobarPasoManual(idPasoInscripcion2, '2026-07-09T10:00:00.000Z', 'Cuerpo con Beto ya personalizado.');

  const h = historialInscripciones('e-manual-2');
  assert.ok(h.length >= 1);

  const db = raw();
  const toques = db.prepare('SELECT canal, que_paso, fecha FROM toque WHERE id_empresa = ?').all('e-manual-2') as any[];
  db.close();
  assert.equal(toques.length, 1);
  assert.equal(toques[0].canal, 'correo');
  assert.equal(toques[0].que_paso, 'Cuerpo con Beto ya personalizado.');
  assert.equal(toques[0].fecha, '2026-07-09T10:00:00.000Z');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
