// sacarDeCadencia (2026-08-03): sacar una cuenta de la cadencia o correr su fecha SIN
// registrar un incumplimiento. Orden del operador ese dia: "esto ni siquiera deberia contar
// como un que no se hizo el paso, simplemente ponmelas para atras".
//
// Los cuatro invariantes que estos tests existen para clavar, en orden de importancia:
//   1. NUNCA escribe seguimiento_aplazado. Es la diferencia entera con aplazarSeguimiento.
//   2. Puede dejar proximo_follow_up_fecha en NULL, que es lo que actualizarEmpresa no
//      permite (su campo es .trim().min(1)).
//   3. Pausar la inscripcion no alcanza: los pasos ya materializados se cancelan, porque
//      pasoInscripcionesPendientes NO mira inscripcion.estado y saldrian igual.
//   4. Una cuenta que no se puede procesar se RECHAZA con su motivo y sale en el resultado.
//      Jamas se salta en silencio (el `continue` pelado de agruparPendientesCorreo).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba, encenderEncoladoNotion } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
// Se enciende la compuerta del outbox A PROPOSITO, para poder probar el lado dificil: que
// esta funcion NO encola a Notion ni siquiera con la compuerta abierta. Con la compuerta
// apagada (el default de produccion) el assert no probaria nada.
encenderEncoladoNotion(dbPath);

const { sacarDeCadencia, aplazarSeguimiento, outboxPendientes, pasoInscripcionesPendientes } = await import('./repository.ts');

const ORG = 8802;

function seedEmpresa(
  id: string,
  opts: { estado?: string | null; owner?: string | null; fecha?: string | null; org?: number; operaBajoId?: string | null; pageId?: string | null } = {},
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, owner, proximo_follow_up_fecha, organizacion_activa_id, opera_bajo_id, notion_page_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, id, id, opts.estado ?? 'lead', opts.owner ?? null, opts.fecha ?? null, opts.org ?? ORG, opts.operaBajoId ?? null, opts.pageId ?? null);
  raw.close();
}

function seedCadencia(idEmpresa: string, opts: { estadoInscripcion?: string; estadoPaso?: string; fechaFin?: string | null } = {}) {
  const raw = new Database(dbPath);
  const cad = raw.prepare(`INSERT INTO cadencia (nombre) VALUES ('Cad ${idEmpresa}')`).run();
  const idCad = Number(cad.lastInsertRowid);
  const paso = raw.prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal) VALUES (?, 1, 0, 'correo')`).run(idCad);
  const idPaso = Number(paso.lastInsertRowid);
  const version = raw.prepare(`INSERT INTO version_paso (id_paso, cuerpo) VALUES (?, 'hola')`).run(idPaso);
  const seg = raw.prepare(`INSERT INTO segmento (nombre, definicion) VALUES ('Seg ${idEmpresa}', '{}')`).run();
  const camp = raw
    .prepare(
      `INSERT INTO campana (nombre, id_cadencia, id_segmento, estado, id_organizacion, proveedor_campana_id, aprobada_envio_gmail)
       VALUES ('Camp ${idEmpresa}', ?, ?, 'activa', ?, 'apollo-x', 1)`,
    )
    .run(idCad, Number(seg.lastInsertRowid), ORG);
  const idCampana = Number(camp.lastInsertRowid);
  const cont = raw
    .prepare(`INSERT INTO contacto (id_empresa, nombre, es_principal, telefono, email, fuente) VALUES (?, 'KDM', 1, '3001112233', ?, 'cockpit')`)
    .run(idEmpresa, `kdm@${idEmpresa}.test`);
  const ins = raw
    .prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado, paso_actual, fecha_inscripcion, fecha_fin) VALUES (?, ?, ?, 1, '2026-07-20', ?)`)
    .run(idCampana, idEmpresa, opts.estadoInscripcion ?? 'activa', opts.fechaFin ?? null);
  const idInscripcion = Number(ins.lastInsertRowid);
  const dest = raw
    .prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto, estado) VALUES (?, ?, 'activo')`)
    .run(idInscripcion, Number(cont.lastInsertRowid));
  const pi = raw
    .prepare(
      `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_programada, aprobado_en, aprobado_por)
       VALUES (?, ?, ?, 'correo', ?, '2026-07-01', '2026-06-30T10:00:00.000Z', 'Sebastian Acosta Molina')`,
    )
    .run(Number(dest.lastInsertRowid), idPaso, Number(version.lastInsertRowid), opts.estadoPaso ?? 'pendiente');
  raw.close();
  return { idCampana, idInscripcion, idPasoInscripcion: Number(pi.lastInsertRowid) };
}

function leerEmpresa(id: string) {
  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = ?`).get(id) as any;
  raw.close();
  return e;
}

function contarAplazos(id: string): number {
  const raw = new Database(dbPath);
  const n = raw.prepare(`SELECT count(*) AS n FROM seguimiento_aplazado WHERE id_empresa = ?`).get(id) as any;
  raw.close();
  return n.n;
}

test.after(() => borrarDbPrueba(dbPath));

// EL INVARIANTE 1. Escrito contra aplazarSeguimiento en el mismo test para que la diferencia
// quede a la vista: mismo gesto aparente, tablas distintas.
test('NO escribe seguimiento_aplazado, mientras que aplazarSeguimiento sobre la misma cuenta SI', () => {
  seedEmpresa('sc-inc', { fecha: '2026-07-10' });
  sacarDeCadencia({ idsEmpresa: ['sc-inc'], nuevaFecha: '2026-09-01' }, ORG);
  assert.equal(contarAplazos('sc-inc'), 0, 'sacar de cadencia no puede dejar un incumplimiento');

  aplazarSeguimiento({ idEmpresa: 'sc-inc', fechaNueva: '2026-09-15', motivo: 'plan_irreal' }, ORG);
  assert.equal(contarAplazos('sc-inc'), 1, 'el contraste: aplazar SI escribe el evento');
});

test('el resultado dice explicito que no cuenta como incumplimiento', () => {
  seedEmpresa('sc-flag', { fecha: '2026-07-10' });
  const r = sacarDeCadencia({ idsEmpresa: ['sc-flag'], nuevaFecha: '2026-09-01' }, ORG);
  assert.equal(r.cuentaComoIncumplimiento, false);
});

// EL INVARIANTE 2. actualizar_empresa no puede hacer esto: su proximoFollowUpFecha es
// .trim().min(1), asi que un string vacio es error de entrada y no hay forma de vaciar.
test('limpiarFecha deja proximo_follow_up_fecha en NULL', () => {
  seedEmpresa('sc-null', { fecha: '2026-07-15' });
  const r = sacarDeCadencia({ idsEmpresa: ['sc-null'], limpiarFecha: true }, ORG);
  assert.equal(leerEmpresa('sc-null').proximo_follow_up_fecha, null);
  // Releida de la base, no el eco del input.
  assert.equal(r.cuentas[0].empresa.proximoFollowUpFecha, null);
  assert.equal(r.cuentas[0].fechaAntes, '2026-07-15');
  assert.equal(r.cuentas[0].fechaAhora, null);
});

test('nuevaFecha corre la fecha hacia atras sin tocar nada mas', () => {
  seedEmpresa('sc-corre', { fecha: '2026-07-15' });
  const r = sacarDeCadencia({ idsEmpresa: ['sc-corre'], nuevaFecha: '2026-11-30' }, ORG);
  assert.equal(leerEmpresa('sc-corre').proximo_follow_up_fecha, '2026-11-30');
  assert.equal(r.cuentas[0].fechaAntes, '2026-07-15');
  assert.equal(r.cuentas[0].fechaAhora, '2026-11-30');
});

// Una cuenta sin fecha programada es justo la que aplazarSeguimiento RECHAZA ("no hay fecha
// incumplida que registrar"). Aca tiene que poder salir de la cadencia igual.
test('una cuenta sin fecha programada se puede sacar igual: no hay fecha que inventar', () => {
  seedEmpresa('sc-sinfecha', { fecha: null });
  seedCadencia('sc-sinfecha');
  const r = sacarDeCadencia({ idsEmpresa: ['sc-sinfecha'], pausarInscripciones: true }, ORG);
  assert.equal(r.aplicadas, 1);
  assert.equal(r.cuentas[0].fechaAntes, null);
  assert.throws(() => aplazarSeguimiento({ idEmpresa: 'sc-sinfecha', fechaNueva: '2026-09-01' }, ORG), /no tiene follow-up programado/);
});

// EL INVARIANTE 3. Sin cancelar los pasos, "la saque de la cadencia" seria mentira: el
// worker los empujaria igual, porque pasoInscripcionesPendientes no mira inscripcion.estado.
test('pausar la inscripcion ademas CANCELA los envios ya materializados, que si no saldrian igual', () => {
  seedEmpresa('sc-corte', { fecha: '2026-07-01' });
  const ids = seedCadencia('sc-corte');

  const antes = pasoInscripcionesPendientes('correo', '2026-08-03T12:00:00.000Z');
  assert.ok(
    antes.some((f) => f.idPasoInscripcion === ids.idPasoInscripcion),
    'sanity: antes de sacarla, ese paso SI estaba en la cola de envio',
  );

  const r = sacarDeCadencia({ idsEmpresa: ['sc-corte'], pausarInscripciones: true, limpiarFecha: true, motivo: 'todavia no esta para toque' }, ORG);

  const despues = pasoInscripcionesPendientes('correo', '2026-08-03T12:00:00.000Z');
  assert.equal(
    despues.find((f) => f.idPasoInscripcion === ids.idPasoInscripcion),
    undefined,
    'despues de sacarla no puede quedar nada por salir',
  );

  assert.deepEqual(r.cuentas[0].enviosCancelados.map((e) => e.idPasoInscripcion), [ids.idPasoInscripcion]);
  assert.equal(r.cuentas[0].enviosCancelados[0].estadoAntes, 'pendiente');
});

test('la inscripcion queda pausada con origen manual, que es el unico que admite reversa', () => {
  const raw = new Database(dbPath);
  const i = raw.prepare(`SELECT estado, origen_fin, motivo_fin, fecha_fin FROM inscripcion WHERE id_empresa = 'sc-corte'`).get() as any;
  raw.close();
  assert.equal(i.estado, 'pausada');
  assert.equal(i.origen_fin, 'manual');
  assert.match(i.motivo_fin, /no es aplazo/);
  assert.match(i.motivo_fin, /todavia no esta para toque/);
  assert.ok(i.fecha_fin);
});

// Pisarle motivo_fin y origen_fin a una inscripcion ya cerrada borraria POR QUE se corto, y
// de ese dato depende quien puede volver a la cadencia (puedeVolverAInscribirse).
test('no vuelve a cerrar una inscripcion que ya estaba terminada: no le pisa el motivo de fin', () => {
  seedEmpresa('sc-yacerrada');
  seedCadencia('sc-yacerrada', { estadoInscripcion: 'pausada', fechaFin: '2026-07-25T10:00:00.000Z', estadoPaso: 'enviada' });
  const raw = new Database(dbPath);
  raw.prepare(`UPDATE inscripcion SET motivo_fin = 'respuesta detectada (whatsapp)', origen_fin = 'respuesta' WHERE id_empresa = 'sc-yacerrada'`).run();
  raw.close();

  const r = sacarDeCadencia({ idsEmpresa: ['sc-yacerrada'], pausarInscripciones: true }, ORG);
  assert.deepEqual(r.cuentas[0].inscripcionesPausadas, []);

  const raw2 = new Database(dbPath);
  const i = raw2.prepare(`SELECT origen_fin, motivo_fin FROM inscripcion WHERE id_empresa = 'sc-yacerrada'`).get() as any;
  raw2.close();
  assert.equal(i.origen_fin, 'respuesta', 'un corte por respuesta no se puede reescribir como baja manual');
});

test('devuelve el estado de la cadencia RELEIDO despues de escribir, no un ok', () => {
  const c = sacarDeCadencia({ idsEmpresa: ['sc-corte'], limpiarFecha: true }, ORG).cuentas[0];
  assert.equal(c.cadenciaDespues.enCadenciaActiva, false);
  assert.equal(c.cadenciaDespues.proximoFollowUpFecha, null);
  assert.equal(c.cadenciaDespues.inscripciones[0].estado, 'pausada');
  assert.equal(c.cadenciaDespues.inscripciones[0].proximoPaso, null, 'ningun paso puede quedar vivo');
});

// EL INVARIANTE 4. Tres motivos de rechazo, cada uno con su nombre, todos en el resultado.
test('una cuenta que no existe se RECHAZA con su motivo, y las demas del lote SI se aplican', () => {
  seedEmpresa('sc-lote1', { fecha: '2026-07-01' });
  seedEmpresa('sc-lote2', { fecha: '2026-07-02' });
  const r = sacarDeCadencia({ idsEmpresa: ['sc-lote1', 'sc-no-existe', 'sc-lote2'], limpiarFecha: true }, ORG);

  assert.equal(r.pedidas, 3);
  assert.equal(r.aplicadas, 2);
  assert.equal(r.rechazadas, 1);
  assert.equal(r.rechazos[0].idEmpresa, 'sc-no-existe');
  assert.equal(r.rechazos[0].motivo, 'empresa_no_existe');
  assert.equal(leerEmpresa('sc-lote1').proximo_follow_up_fecha, null);
  assert.equal(leerEmpresa('sc-lote2').proximo_follow_up_fecha, null);
});

// El invariante que hace imposible el descarte silencioso: cada id pedido aparece exactamente
// una vez, en aplicadas o en rechazos. No hay tercer destino.
test('cada id pedido sale en exactamente una de las dos listas: no hay descarte silencioso', () => {
  seedEmpresa('sc-inv1', { fecha: '2026-07-01' });
  seedEmpresa('sc-inv2', { org: 7777 });
  seedEmpresa('sc-inv-viva');
  seedEmpresa('sc-inv3', { operaBajoId: 'sc-inv-viva' });
  const pedidas = ['sc-inv1', 'sc-inv2', 'sc-inv3', 'sc-inv-fantasma'];

  const r = sacarDeCadencia({ idsEmpresa: pedidas, limpiarFecha: true }, ORG);
  const vistos = [...r.cuentas.map((c) => c.idEmpresa), ...r.rechazos.map((x) => x.idEmpresa)];
  assert.deepEqual(vistos.sort(), [...pedidas].sort());
  assert.equal(r.aplicadas + r.rechazadas, r.pedidas);

  assert.equal(r.rechazos.find((x) => x.idEmpresa === 'sc-inv2')!.motivo, 'otra_organizacion');
  assert.equal(r.rechazos.find((x) => x.idEmpresa === 'sc-inv3')!.motivo, 'identidad_absorbida');
  assert.match(r.rechazos.find((x) => x.idEmpresa === 'sc-inv3')!.detalle, /sc-inv-viva/);
});

test('una cuenta de otra organizacion NO se toca, ni siquiera la fecha', () => {
  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'sc-inv2'`).get() as any;
  raw.close();
  assert.equal(e.proximo_follow_up_fecha, null, 'nacio sin fecha y sigue sin fecha: no se escribio nada');
});

test('sin ninguna accion LANZA: un no-op que reporta exito es peor que un error', () => {
  seedEmpresa('sc-noop', { fecha: '2026-07-01' });
  assert.throws(() => sacarDeCadencia({ idsEmpresa: ['sc-noop'] }, ORG), /al menos una accion/);
  assert.equal(leerEmpresa('sc-noop').proximo_follow_up_fecha, '2026-07-01');
});

test('nuevaFecha y limpiarFecha juntas LANZAN: se contradicen', () => {
  assert.throws(() => sacarDeCadencia({ idsEmpresa: ['sc-noop'], nuevaFecha: '2026-09-01', limpiarFecha: true }, ORG), /se contradicen/);
});

test('una fecha fuera de formato YYYY-MM-DD LANZA antes de escribir', () => {
  assert.throws(() => sacarDeCadencia({ idsEmpresa: ['sc-noop'], nuevaFecha: 'September 1, 2026' }, ORG), /YYYY-MM-DD/);
  assert.equal(leerEmpresa('sc-noop').proximo_follow_up_fecha, '2026-07-01');
});

test('ids repetidos LANZAN: el resultado promete una fila por cuenta pedida', () => {
  assert.throws(() => sacarDeCadencia({ idsEmpresa: ['sc-noop', 'sc-noop'], limpiarFecha: true }, ORG), /repetidos/);
});

test('lista vacia LANZA: sacar de la cadencia a nadie no es una operacion', () => {
  assert.throws(() => sacarDeCadencia({ idsEmpresa: [], limpiarFecha: true }, ORG));
});

// La herramienta no le escribe a Notion (esa decision esta cerrada) y ademas el contrato
// CambioNotion no sabe representar "esta fecha se borro". Con la compuerta ENCENDIDA arriba,
// este assert prueba la decision y no la casualidad.
test('no encola nada al outbox de Notion ni con la compuerta encendida', () => {
  seedEmpresa('sc-notion', { fecha: '2026-07-01', pageId: 'page-sc-notion' });
  sacarDeCadencia({ idsEmpresa: ['sc-notion'], limpiarFecha: true }, ORG);
  assert.equal(outboxPendientes().find((p) => p.payload.notionPageId === 'page-sc-notion'), undefined);
});

test('deja la huella en sync_cambios diciendo que NO es un aplazo', () => {
  const raw = new Database(dbPath);
  const f = raw.prepare(`SELECT detalle FROM sync_cambios WHERE id_registro = 'sc-notion' ORDER BY id DESC LIMIT 1`).get() as any;
  raw.close();
  assert.match(f.detalle, /NO es aplazo/);
  assert.match(f.detalle, /no cuenta como paso incumplido/);
});
