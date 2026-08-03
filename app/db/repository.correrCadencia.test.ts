// correrCadencia (2026-08-03): agarrar un pedazo de una cadencia y correrlo N dias, en
// bloque, SIN que eso cuente como paso incumplido. Lo pidio el operador el mismo dia que
// vio su cola con 43 pasos vencidos de cuentas en hold: "muevelo para atras, no me pongas a
// hacer toques de esos hoy".
//
// Es hermana de sacarDeCadencia y la diferencia importa: sacarDeCadencia BAJA la cuenta de
// la secuencia (pausa la inscripcion y cancela los envios); correrCadencia la deja corriendo
// y solo mueve las fechas. La primera se usa cuando la cuenta no va; la segunda cuando la
// cuenta va, pero no hoy.
//
// Los invariantes que estos tests clavan:
//   1. NUNCA escribe seguimiento_aplazado ni toca el estado del paso: correr no es
//      incumplir. El resultado lleva cuentaComoIncumplimiento: false en el contrato.
//   2. Mueve solo los pasos que TODAVIA pueden salir. Uno ya enviado es historia.
//   3. El pedazo se elige: por campana y por fecha de corte. Sin corte, se corre todo lo vivo.
//   4. Un paso sin fecha programada no se inventa: se reporta aparte, no se mueve.
//   5. Una cuenta que no se puede procesar se RECHAZA con su motivo, nunca se salta en silencio.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { correrCadencia } = await import('./repository.ts');

const ORG = 8803;

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, opts: { estado?: string; fecha?: string | null; org?: number; operaBajoId?: string | null } = {}) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, owner, proximo_follow_up_fecha, organizacion_activa_id, opera_bajo_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 'Sebastian Acosta Molina', ?, ?, ?)`,
  ).run(id, id, id, opts.estado ?? 'on_hold', opts.fecha ?? null, opts.org ?? ORG, opts.operaBajoId ?? null);
  db.close();
}

// Una inscripcion con N pasos, cada uno con su fecha y su estado.
function seedCadencia(idEmpresa: string, pasos: { fecha: string | null; estado?: string }[], nombreCampana = 'Precio ISPs B') {
  const db = raw();
  const idCad = Number(db.prepare(`INSERT INTO cadencia (nombre) VALUES (?)`).run(`Cad ${idEmpresa}`).lastInsertRowid);
  const idSeg = Number(db.prepare(`INSERT INTO segmento (nombre, definicion) VALUES (?, '{}')`).run(`Seg ${idEmpresa}`).lastInsertRowid);
  const idCampana = Number(
    db
      .prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento, estado, id_organizacion) VALUES (?, ?, ?, 'activa', ?)`)
      .run(nombreCampana, idCad, idSeg, ORG).lastInsertRowid,
  );
  // Una cuenta puede estar en dos campanas a la vez y el contacto principal es el mismo: se
  // reusa si ya existe (la tabla de prueba tiene el id_empresa unico en contacto).
  const existente = db.prepare(`SELECT id_contacto id FROM contacto WHERE id_empresa = ?`).get(idEmpresa) as { id: number } | undefined;
  const idContacto =
    existente?.id ??
    Number(
      db
        .prepare(`INSERT INTO contacto (id_empresa, nombre, es_principal, email, fuente) VALUES (?, 'KDM', 1, ?, 'cockpit')`)
        .run(idEmpresa, `kdm@${idEmpresa}.test`).lastInsertRowid,
    );
  const idInscripcion = Number(
    db
      .prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado, paso_actual, fecha_inscripcion) VALUES (?, ?, 'activa', 1, '2026-07-20')`)
      .run(idCampana, idEmpresa).lastInsertRowid,
  );
  const idDestinatario = Number(
    db.prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto, estado) VALUES (?, ?, 'activo')`).run(idInscripcion, idContacto)
      .lastInsertRowid,
  );

  const ids: number[] = [];
  pasos.forEach((p, i) => {
    const idPaso = Number(
      db.prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal) VALUES (?, ?, ?, 'llamada')`).run(idCad, i + 1, i * 3)
        .lastInsertRowid,
    );
    const idVersion = Number(db.prepare(`INSERT INTO version_paso (id_paso, cuerpo) VALUES (?, 'hola')`).run(idPaso).lastInsertRowid);
    ids.push(
      Number(
        db
          .prepare(
            `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_programada) VALUES (?, ?, ?, 'llamada', ?, ?)`,
          )
          .run(idDestinatario, idPaso, idVersion, p.estado ?? 'pendiente', p.fecha).lastInsertRowid,
      ),
    );
  });
  db.close();
  return { idCampana, idInscripcion, idsPaso: ids };
}

function fechaDe(idPasoInscripcion: number): string | null {
  const db = raw();
  const f = db.prepare(`SELECT fecha_programada f FROM paso_inscripcion WHERE id_paso_inscripcion = ?`).get(idPasoInscripcion) as {
    f: string | null;
  };
  db.close();
  return f.f;
}

function estadoDe(idPasoInscripcion: number): string {
  const db = raw();
  const e = db.prepare(`SELECT estado FROM paso_inscripcion WHERE id_paso_inscripcion = ?`).get(idPasoInscripcion) as { estado: string };
  db.close();
  return e.estado;
}

function contarAplazos(idEmpresa: string): number {
  const db = raw();
  const n = db.prepare(`SELECT count(*) n FROM seguimiento_aplazado WHERE id_empresa = ?`).get(idEmpresa) as { n: number };
  db.close();
  return n.n;
}

test('corre los pasos vivos N dias y NO los marca incumplidos', () => {
  seedEmpresa('cc-silcom');
  const { idsPaso } = seedCadencia('cc-silcom', [{ fecha: '2026-07-28' }, { fecha: '2026-07-31' }]);

  const r = correrCadencia({ idsEmpresa: ['cc-silcom'], dias: 7, motivo: 'sigue en hold' }, ORG);

  assert.equal(r.aplicadas, 1);
  assert.equal(r.rechazadas, 0);
  assert.equal(r.cuentaComoIncumplimiento, false, 'el contrato dice explicito que esto no es un incumplimiento');
  assert.equal(fechaDe(idsPaso[0]), '2026-08-04');
  assert.equal(fechaDe(idsPaso[1]), '2026-08-07');
  assert.equal(estadoDe(idsPaso[0]), 'pendiente', 'correr no cambia el estado del paso');
  assert.equal(contarAplazos('cc-silcom'), 0, 'no es un aplazo: seguimiento_aplazado no se toca');
  // El resultado se relee de la base, no es el eco del input.
  assert.deepEqual(
    r.cuentas[0].pasosCorridos.map((p) => [p.fechaAntes, p.fechaAhora]),
    [
      ['2026-07-28', '2026-08-04'],
      ['2026-07-31', '2026-08-07'],
    ],
  );
});

test('un paso ya enviado no se mueve: es historia', () => {
  seedEmpresa('cc-enviado');
  const { idsPaso } = seedCadencia('cc-enviado', [{ fecha: '2026-07-20', estado: 'enviada' }, { fecha: '2026-07-28' }]);

  const r = correrCadencia({ idsEmpresa: ['cc-enviado'], dias: 3 }, ORG);

  assert.equal(fechaDe(idsPaso[0]), '2026-07-20', 'el enviado se queda donde estaba');
  assert.equal(fechaDe(idsPaso[1]), '2026-07-31');
  assert.deepEqual(r.cuentas[0].pasosCorridos.map((p) => p.idPasoInscripcion), [idsPaso[1]]);
});

test('hasta= corre solo el pedazo vencido y deja quieto lo que viene despues', () => {
  seedEmpresa('cc-pedazo');
  const { idsPaso } = seedCadencia('cc-pedazo', [{ fecha: '2026-07-28' }, { fecha: '2026-08-10' }]);

  correrCadencia({ idsEmpresa: ['cc-pedazo'], dias: 14, hasta: '2026-08-03' }, ORG);

  assert.equal(fechaDe(idsPaso[0]), '2026-08-11', 'el vencido se corrio');
  assert.equal(fechaDe(idsPaso[1]), '2026-08-10', 'el futuro no se toco');
});

// La base solo admite UNA inscripcion activa por cuenta (indice ux_inscripcion_activa en
// produccion), asi que el filtro se prueba con dos cuentas: cada una en su campana.
test('idCampana= limita el bloque a una sola campana', () => {
  seedEmpresa('cc-camp-a');
  seedEmpresa('cc-camp-b');
  const a = seedCadencia('cc-camp-a', [{ fecha: '2026-07-28' }], 'Precio ISPs B');
  const b = seedCadencia('cc-camp-b', [{ fecha: '2026-07-28' }], 'Otra campana');

  const r = correrCadencia({ idsEmpresa: ['cc-camp-a', 'cc-camp-b'], dias: 5, idCampana: a.idCampana }, ORG);

  assert.equal(fechaDe(a.idsPaso[0]), '2026-08-02');
  assert.equal(fechaDe(b.idsPaso[0]), '2026-07-28', 'la cuenta de la otra campana no se toco');
  assert.equal(r.pasosCorridos, 1, 'el resultado dice cuantos pasos se movieron de verdad');
});

test('un paso sin fecha programada se reporta, no se inventa una', () => {
  seedEmpresa('cc-sinfecha');
  const { idsPaso } = seedCadencia('cc-sinfecha', [{ fecha: null }, { fecha: '2026-07-28' }]);

  const r = correrCadencia({ idsEmpresa: ['cc-sinfecha'], dias: 2 }, ORG);

  assert.equal(fechaDe(idsPaso[0]), null);
  assert.deepEqual(r.cuentas[0].pasosSinFecha, [idsPaso[0]], 'sale en el resultado: no se descarta callado');
  assert.equal(fechaDe(idsPaso[1]), '2026-07-30');
});

test('correrSeguimiento mueve tambien el proximo paso de la cuenta, y por defecto no lo toca', () => {
  seedEmpresa('cc-seg', { fecha: '2026-07-28' });
  seedCadencia('cc-seg', [{ fecha: '2026-07-28' }]);

  const quieto = correrCadencia({ idsEmpresa: ['cc-seg'], dias: 4 }, ORG);
  assert.equal(quieto.cuentas[0].fechaSeguimientoAhora, '2026-07-28', 'por defecto la fecha de la cuenta no se mueve');

  const movido = correrCadencia({ idsEmpresa: ['cc-seg'], dias: 4, correrSeguimiento: true }, ORG);
  assert.equal(movido.cuentas[0].fechaSeguimientoAntes, '2026-07-28');
  assert.equal(movido.cuentas[0].fechaSeguimientoAhora, '2026-08-01');
  assert.equal(contarAplazos('cc-seg'), 0, 'mover la fecha por aca sigue sin ser un aplazo');
});

test('rechaza con motivo: cuenta inexistente, de otra organizacion, o absorbida por una fusion', () => {
  seedEmpresa('cc-otra-org', { org: 9999 });
  seedEmpresa('cc-absorbida', { operaBajoId: 'cc-silcom' });
  seedCadencia('cc-absorbida', [{ fecha: '2026-07-28' }]);

  const r = correrCadencia({ idsEmpresa: ['cc-no-existe', 'cc-otra-org', 'cc-absorbida'], dias: 1 }, ORG);

  assert.equal(r.aplicadas, 0);
  assert.equal(r.rechazadas, 3);
  assert.deepEqual(
    r.rechazos.map((x) => x.motivo),
    ['empresa_no_existe', 'otra_organizacion', 'identidad_absorbida'],
  );
});

test('dias en 0 se rechaza de entrada: seria un no-op que reporta exito', () => {
  seedEmpresa('cc-cero');
  assert.throws(() => correrCadencia({ idsEmpresa: ['cc-cero'], dias: 0 }, ORG));
});

test('dias negativos adelantan, que es la misma operacion al reves', () => {
  seedEmpresa('cc-adelanta');
  const { idsPaso } = seedCadencia('cc-adelanta', [{ fecha: '2026-08-10' }]);

  correrCadencia({ idsEmpresa: ['cc-adelanta'], dias: -3 }, ORG);
  assert.equal(fechaDe(idsPaso[0]), '2026-08-07');
});
