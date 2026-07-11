// Auto-archivo de campanas (sesion 2026-07-10): distinto de marcarCampanaFinalizada
// ("Cancelar", a mano, antes de tiempo). Aca la campana llego sola al final de su
// cadencia -- campanasParaArchivar/archivarCampanasCompletadas la detectan sin que
// nadie la marque a mano. Ver tareaArchivarCampanas en app/worker/index.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  historialInscripciones,
  destinatariosDeInscripcion,
  materializarPasosDebidos,
  agendaHoyCadencias,
  marcarPasoInscripcionEnviada,
  campanasParaArchivar,
  archivarCampanasCompletadas,
} = await import('./repository.ts');

const CONFIG = { diasBloqueados: [], corrimiento: 'siguiente' as const };

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, categoria: string, opts: { email?: string; telefono?: string } = {}) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, telefono, fuente)
     VALUES (?, 'Contacto', 0, 1, ?, ?, 'seed')`,
  ).run(id, opts.email ?? null, opts.telefono ?? null);
  db.close();
}

function estadoCampana(idCampana: number): string {
  const db = raw();
  const r = db.prepare('SELECT estado FROM campana WHERE id_campana = ?').get(idCampana) as any;
  db.close();
  return r.estado;
}

function inscripcionActivaDe(idEmpresa: string) {
  return historialInscripciones(idEmpresa).find((i) => i.estado === 'activa')!;
}

function fijarAnchor(idInscripcion: number, fechaIso: string) {
  const db = raw();
  db.prepare('UPDATE inscripcion SET fecha_inscripcion = ? WHERE id_inscripcion = ?').run(fechaIso, idInscripcion);
  db.close();
}

// El anchor (fecha_inscripcion) nace en el momento real de la corrida (hoy), no en la
// fecha del escenario -- sin fijarlo antes de materializar, `fecha` (2026-07-01, en el
// pasado) queda ANTES del anchor y proximoPasoDebido no ve nada vencido todavia.
function fijarAnchors(idsEmpresa: string[], fecha: string) {
  for (const idEmpresa of idsEmpresa) {
    fijarAnchor(inscripcionActivaDe(idEmpresa).id, `${fecha}T00:00:00.000Z`);
  }
}

function marcarTodoEnviado(idCampana: number, fecha: string) {
  materializarPasosDebidos(fecha, CONFIG);
  for (const f of agendaHoyCadencias(fecha)) {
    marcarPasoInscripcionEnviada(f.idPasoInscripcion, 'apollo', `msg-${f.idPasoInscripcion}`, `${fecha}T09:00:00.000Z`);
  }
}

test('archiva una campana de un solo paso en cuanto ese paso se envia', () => {
  seedEmpresa('e-arch-1', 'arch-cat-1', { email: 'a@x.com' });
  const idCadencia = crearCadencia({ nombre: 'C arch 1', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' }] });
  const idSeg = guardarSegmento({ nombre: 'arch-seg-1', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['arch-cat-1'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp arch 1', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);
  fijarAnchors(['e-arch-1'], '2026-07-01');

  assert.equal(campanasParaArchivar().some((c) => c.idCampana === idCampana), false, 'todavia no se materializa nada');

  marcarTodoEnviado(idCampana, '2026-07-01');

  assert.ok(campanasParaArchivar().some((c) => c.idCampana === idCampana), 'el unico paso ya se envio: la cadencia esta agotada');
  const archivadas = archivarCampanasCompletadas();
  assert.ok(archivadas.some((c) => c.idCampana === idCampana));
  assert.equal(estadoCampana(idCampana), 'archivada');
});

test('no archiva si todavia hay un paso pendiente de la cadencia', () => {
  seedEmpresa('e-arch-2', 'arch-cat-2', { email: 'b@x.com', telefono: '3000000002' });
  const idCadencia = crearCadencia({
    nombre: 'C arch 2',
    pasos: [
      { orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' },
      { orden: 2, diaOffset: 3, canal: 'llamada', objetivo: 'seguimiento', esManual: true },
    ],
  });
  const idSeg = guardarSegmento({ nombre: 'arch-seg-2', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['arch-cat-2'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp arch 2', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);
  fijarAnchors(['e-arch-2'], '2026-07-01');

  marcarTodoEnviado(idCampana, '2026-07-01'); // solo alcanza el paso 1 (dia 0)

  assert.equal(campanasParaArchivar().some((c) => c.idCampana === idCampana), false, 'el paso 2 (llamada, dia 3) todavia no se ha enviado');
  assert.equal(estadoCampana(idCampana), 'activa');
});

test('ignora las inscripciones bloqueadas: archiva aunque una quede atascada sin canal', () => {
  seedEmpresa('e-arch-3a', 'arch-cat-3', { email: 'c@x.com' });
  seedEmpresa('e-arch-3b', 'arch-cat-3'); // sin email ni telefono -> bloqueada
  const idCadencia = crearCadencia({ nombre: 'C arch 3', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' }] });
  const idSeg = guardarSegmento({ nombre: 'arch-seg-3', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['arch-cat-3'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp arch 3', idCadencia, idSegmento: idSeg }, 1);
  const res = inscribirCampana(idCampana, 1);
  assert.equal(res.bloqueadas, 1, 'e-arch-3b entra bloqueada (sin email)');
  fijarAnchors(['e-arch-3a'], '2026-07-01');

  marcarTodoEnviado(idCampana, '2026-07-01');

  assert.ok(campanasParaArchivar().some((c) => c.idCampana === idCampana), 'la bloqueada no debe impedir el archivo');
  archivarCampanasCompletadas();
  assert.equal(estadoCampana(idCampana), 'archivada');
});

test('no archiva una campana recien lanzada sin ninguna inscripcion todavia', () => {
  const idCadencia = crearCadencia({ nombre: 'C arch 4', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' }] });
  const idSeg = guardarSegmento({ nombre: 'arch-seg-4', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['arch-cat-4-sin-match'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp arch 4', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1); // 0 empresas matchean el segmento -> 0 inscripciones

  assert.equal(campanasParaArchivar().some((c) => c.idCampana === idCampana), false);
  assert.equal(estadoCampana(idCampana), 'activa');
});

test.after(() => borrarDbPrueba(dbPath));
