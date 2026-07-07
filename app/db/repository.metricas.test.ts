// Task 1.1: metricasHub para el header del hub de campanas.
// DB de archivo temporal, nunca isps.db real.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { metricasHub, listarInscritasHub } = await import('./repository.ts');

function isoHaceDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

test('metricasHub cuenta toques de la semana y tasa de respuesta por cohorte enviado->respondio', () => {
  const raw = new Database(dbPath);
  const ahora = new Date().toISOString();

  raw.prepare(`INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial) VALUES ('e1','nit','ISP Uno','isp uno','activo')`).run();

  raw.prepare(`INSERT INTO cadencia (id_cadencia, nombre, activa) VALUES (1, 'Outbound', 1)`).run();
  raw.prepare(`INSERT INTO paso_cadencia (id_paso, id_cadencia, orden, dia_offset, canal) VALUES (1, 1, 1, 0, 'correo')`).run();
  raw.prepare(`INSERT INTO paso_cadencia (id_paso, id_cadencia, orden, dia_offset, canal) VALUES (2, 1, 2, 3, 'correo')`).run();
  raw.prepare(`INSERT INTO version_paso (id_version, id_paso, es_default, peso) VALUES (1, 1, 1, 1)`).run();
  raw.prepare(`INSERT INTO version_paso (id_version, id_paso, es_default, peso) VALUES (2, 2, 1, 1)`).run();

  raw.prepare(`INSERT INTO segmento (id_segmento, nombre, definicion) VALUES (1, 'Todos', '{}')`).run();

  raw.prepare(`INSERT INTO campana (id_campana, nombre, id_cadencia, id_segmento, estado) VALUES (1, 'Campana 1', 1, 1, 'activa')`).run();

  // Tres inscripciones activas para la misma campana (cada una en distinta empresa
  // para no chocar con el indice unico parcial de inscripcion activa por empresa).
  raw.prepare(`INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial) VALUES ('e2','nit','ISP Dos','isp dos','activo')`).run();
  raw.prepare(`INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial) VALUES ('e3','nit','ISP Tres','isp tres','activo')`).run();

  raw.prepare(`INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado, fecha_inscripcion) VALUES (1, 1, 'e1', 'activa', ?)`).run(ahora);
  raw.prepare(`INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado, fecha_inscripcion) VALUES (2, 1, 'e2', 'activa', ?)`).run(ahora);
  raw.prepare(`INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado, fecha_inscripcion) VALUES (3, 1, 'e3', 'activa', ?)`).run(ahora);

  raw.prepare(`INSERT INTO contacto (id_contacto, id_empresa, fuente) VALUES (1, 'e1', 'notion')`).run();
  raw.prepare(`INSERT INTO contacto (id_contacto, id_empresa, fuente) VALUES (2, 'e2', 'notion')`).run();
  raw.prepare(`INSERT INTO contacto (id_contacto, id_empresa, fuente) VALUES (3, 'e3', 'notion')`).run();

  raw.prepare(`INSERT INTO destinatario (id_destinatario, id_inscripcion, id_contacto, estado) VALUES (1, 1, 1, 'activo')`).run();
  raw.prepare(`INSERT INTO destinatario (id_destinatario, id_inscripcion, id_contacto, estado) VALUES (2, 2, 2, 'activo')`).run();
  raw.prepare(`INSERT INTO destinatario (id_destinatario, id_inscripcion, id_contacto, estado) VALUES (3, 3, 3, 'activo')`).run();

  raw.prepare(`INSERT INTO paso_inscripcion (id_paso_inscripcion, id_destinatario, id_paso, id_version, canal, estado, fecha_enviada) VALUES (1, 1, 1, 1, 'correo', 'enviado', ?)`).run(isoHaceDias(1));
  raw.prepare(`INSERT INTO paso_inscripcion (id_paso_inscripcion, id_destinatario, id_paso, id_version, canal, estado, fecha_enviada) VALUES (2, 2, 1, 1, 'correo', 'enviado', ?)`).run(isoHaceDias(2));
  raw.prepare(`INSERT INTO paso_inscripcion (id_paso_inscripcion, id_destinatario, id_paso, id_version, canal, estado, fecha_enviada) VALUES (3, 3, 1, 1, 'correo', 'enviado', ?)`).run(isoHaceDias(3));

  // 3 eventos 'enviado' esta semana (uno por paso_inscripcion).
  raw.prepare(`INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento) VALUES (1, 'enviado', 'correo', 'ev-1', ?)`).run(isoHaceDias(1));
  raw.prepare(`INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento) VALUES (2, 'enviado', 'correo', 'ev-2', ?)`).run(isoHaceDias(2));
  raw.prepare(`INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento) VALUES (3, 'enviado', 'correo', 'ev-3', ?)`).run(isoHaceDias(3));

  // Solo el paso_inscripcion 1 tiene una respuesta asociada (misma idPasoInscripcion,
  // fecha fuera de la ventana a proposito: la cohorte no filtra por fecha del respondio).
  raw.prepare(`INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento) VALUES (1, 'respondio', 'correo', 'ev-4', ?)`).run(isoHaceDias(30));

  // Evento 'enviado' viejo (fuera de la ventana de 7 dias): no debe contar en toquesSemana.
  raw.prepare(`INSERT INTO paso_inscripcion (id_paso_inscripcion, id_destinatario, id_paso, id_version, canal, estado, fecha_enviada) VALUES (4, 1, 2, 2, 'correo', 'enviado', ?)`).run(isoHaceDias(20));
  raw.prepare(`INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento) VALUES (4, 'enviado', 'correo', 'ev-5', ?)`).run(isoHaceDias(20));

  // Una empresa bloqueada (cola de revision), cuenta en bloqueadasEsperandoRegla.
  raw.prepare(`INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial) VALUES ('e4','nit','ISP Cuatro','isp cuatro','activo')`).run();
  raw.prepare(`INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado, fecha_inscripcion) VALUES (4, 1, 'e4', 'bloqueada', ?)`).run(ahora);

  raw.close();

  const m = metricasHub();
  assert.equal(m.toquesSemana, 3);
  assert.equal(m.tasaRespuesta, 1 / 3);
  assert.equal(m.empresasEnSecuencia, 3);
  assert.equal(m.bloqueadasEsperandoRegla, 1);
});

test('listarInscritasHub trae activas y bloqueadas de cualquier campana, no inventa un estado nuevo', () => {
  const filas = listarInscritasHub();
  assert.equal(filas.length, 4);

  const estados = new Set(filas.map((f) => f.estado));
  assert.deepEqual(estados, new Set(['activa', 'bloqueada']));

  const bloqueada = filas.find((f) => f.empresa === 'ISP Cuatro');
  assert.ok(bloqueada);
  assert.equal(bloqueada!.estado, 'bloqueada');
  assert.equal(bloqueada!.campana, 'Campana 1');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
