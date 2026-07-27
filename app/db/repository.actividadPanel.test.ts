// Pruebas del bloque Fase 7 (agregaciones de solo lectura para el panel de actividad):
// contarToquesEnRango, leadsTocadosEnRango, toquesPorCanal, toquesPorResultado.
//
// 2026-07-27: un solo hilo de WhatsApp de una sola empresa mando 42 mensajes ENTRANTES en
// un dia (fuente='whatsapp_entrante', ver registrarToqueEntrante), y este bloque los conto
// como actividad ejecutada -- 42 toques del dia con cero toques reales del operador. Estas
// pruebas fallan contra el codigo de antes del fix (el bloque no filtraba por fuente) y
// pasan con el fix (enRango excluye fuente='whatsapp_entrante').
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { contarToquesEnRango, leadsTocadosEnRango, toquesPorCanal, toquesPorResultado } = await import('./repository.ts');

function seedEmpresa(idEmpresa: string, owner: string | null = null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, 1)`,
    )
    .run(idEmpresa, owner);
  raw.close();
}

function seedToque(idEmpresa: string, fecha: string, opts: { canal?: string; resultado?: string; fuente?: string } = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO toque (id_empresa, fecha, canal, resultado, fuente, id_organizacion)
       VALUES (?, ?, ?, ?, ?, 1)`,
    )
    .run(idEmpresa, fecha, opts.canal ?? 'whatsapp', opts.resultado ?? null, opts.fuente ?? 'cockpit');
  raw.close();
}

test('contarToquesEnRango excluye los toques entrantes (fuente=whatsapp_entrante)', () => {
  seedEmpresa('ent-1');
  // 1 toque ejecutado por el operador.
  seedToque('ent-1', '2026-07-27', { canal: 'llamada', resultado: 'contesto_sigue_seguimiento', fuente: 'cockpit' });
  // 42 respuestas del ISP en el mismo hilo: caso real del 2026-07-27.
  for (let i = 0; i < 42; i++) {
    seedToque('ent-1', '2026-07-27', { canal: 'whatsapp', fuente: 'whatsapp_entrante' });
  }

  assert.equal(contarToquesEnRango('2026-07-27', '2026-07-27'), 1, 'los 42 entrantes no deben sumar al conteo de actividad ejecutada');
});

// Fechas DISTINTAS por test a proposito: contarToquesEnRango/leadsTocadosEnRango/
// toquesPorCanal/toquesPorResultado no filtran por id_organizacion (ven a todo el equipo,
// ver el comentario de cabecera del bloque Fase 7), asi que comparten la misma DB del
// modulo sin aislarse entre si -- la unica forma de no pisarse es acotar el rango.
test('leadsTocadosEnRango no cuenta una empresa que solo tiene toques entrantes', () => {
  seedEmpresa('ent-2');
  seedToque('ent-2', '2026-06-01', { fuente: 'whatsapp_entrante' });

  assert.equal(leadsTocadosEnRango('2026-06-01', '2026-06-01'), 0, 'sin ningun toque ejecutado, la empresa no cuenta como tocada');

  seedEmpresa('ent-3');
  seedToque('ent-3', '2026-06-01', { canal: 'llamada', fuente: 'cockpit' });
  seedToque('ent-3', '2026-06-01', { fuente: 'whatsapp_entrante' });
  assert.equal(leadsTocadosEnRango('2026-06-01', '2026-06-01'), 1, 'ent-3 si cuenta: tiene un toque ejecutado ademas del entrante');
});

test('toquesPorCanal no infla el bucket whatsapp con las respuestas del ISP', () => {
  seedEmpresa('ent-4');
  seedToque('ent-4', '2026-06-02', { canal: 'whatsapp', fuente: 'cadencia_manual' });
  for (let i = 0; i < 5; i++) {
    seedToque('ent-4', '2026-06-02', { canal: 'whatsapp', fuente: 'whatsapp_entrante' });
  }

  const porCanal = toquesPorCanal('2026-06-02', '2026-06-02');
  assert.equal(porCanal.whatsapp, 1, 'solo el whatsapp saliente de la cadencia, ninguno de los 5 entrantes');
});

test('toquesPorResultado no cuenta los toques entrantes (siempre sin resultado)', () => {
  seedEmpresa('ent-5');
  seedToque('ent-5', '2026-06-03', { canal: 'llamada', resultado: 'contesto_no', fuente: 'cockpit' });
  seedToque('ent-5', '2026-06-03', { fuente: 'whatsapp_entrante' });

  const porResultado = toquesPorResultado('2026-06-03', '2026-06-03');
  assert.equal(porResultado.contesto_no, 1);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
