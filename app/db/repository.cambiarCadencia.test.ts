// write-path del MCP (2026-07-24, integraciones/propuesta-write-path.md): cambiarCadencia
// reprograma el follow-up (fecha/canal/proximo_paso) y, opcionalmente, mueve la empresa a
// otra cadencia (inscribirEmpresaEnCadencia). docs/operar-data.md Receta 3 dejaba esto sin
// camino limpio para UNA empresa; esta funcion lo cierra reusando el dominio existente.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba, encenderEncoladoNotion } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
// La compuerta del encolado a Notion nace APAGADA en produccion (2026-07-26). Este archivo
// prueba el lado ENCENDIDO, asi que la abre explicitamente; el lado apagado tiene su propio
// archivo (repository.compuertaOutbox.test.ts).
encenderEncoladoNotion(dbPath);

const { cambiarCadencia, outboxPendientes } = await import('./repository.ts');

function seedEmpresa(id: string, notionPageId: string | null = null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1, ?)`,
    )
    .run(id, id, id, notionPageId);
  raw.close();
}

function leerEmpresa(id: string) {
  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT proximo_follow_up_fecha, proximo_canal, proximo_paso FROM empresa WHERE id_empresa = ?`).get(id) as any;
  raw.close();
  return e;
}

test('cambiarCadencia reprograma proximo_follow_up_fecha, proximo_canal y proximo_paso', () => {
  seedEmpresa('cc1');
  cambiarCadencia({ idEmpresa: 'cc1', proximoFollowUp: '2026-08-01', proximoCanal: 'whatsapp', proximoPaso: 'mandar propuesta' }, 1);

  const e = leerEmpresa('cc1');
  assert.equal(e.proximo_follow_up_fecha, '2026-08-01');
  assert.equal(e.proximo_canal, 'whatsapp');
  assert.equal(e.proximo_paso, 'mandar propuesta');
});

test('cambiarCadencia encola fechaProximoPaso + proximoPaso al outbox cuando hay notion_page_id', () => {
  seedEmpresa('cc2', 'page-cc2');
  cambiarCadencia({ idEmpresa: 'cc2', proximoFollowUp: '2026-08-05', proximoPaso: 'llamar de nuevo' }, 1);

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-cc2');
  assert.ok(fila);
  assert.equal(fila!.payload.fechaProximoPaso, '2026-08-05');
  assert.equal(fila!.payload.proximoPaso, 'llamar de nuevo');
});

test('cambiarCadencia con idCampana inscribe la empresa en esa cadencia (una inscripcion activa)', () => {
  seedEmpresa('cc3');
  // Cadencia + campana minimas para inscribir
  const raw = new Database(dbPath);
  const cad = raw.prepare(`INSERT INTO cadencia (nombre) VALUES ('Cad prueba')`).run();
  const idCad = Number(cad.lastInsertRowid);
  raw.prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal) VALUES (?, 1, 0, 'llamada')`).run(idCad);
  // elegirDestinatarioDefault (core/inscripcion.ts) exige email para ser destinatario: sin
  // email la inscripcion nace 'bloqueada'. Con email + telefono queda 'activa'.
  raw.prepare(`INSERT INTO contacto (id_empresa, nombre, es_principal, es_key_decision_maker, telefono, email, fuente) VALUES ('cc3', 'KDM', 1, 1, '3001112233', 'kdm@cc3.test', 'cockpit')`).run();
  const seg = raw.prepare(`INSERT INTO segmento (nombre, definicion) VALUES ('Seg', '{}')`).run();
  const camp = raw
    .prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento, estado, regla_faltante) VALUES ('Camp', ?, ?, 'activa', 'cola')`)
    .run(idCad, Number(seg.lastInsertRowid));
  const idCampana = Number(camp.lastInsertRowid);
  raw.close();

  cambiarCadencia({ idEmpresa: 'cc3', idCampana, proximoFollowUp: '2026-08-10' }, 1);

  const raw2 = new Database(dbPath);
  const ins = raw2.prepare(`SELECT id_campana, estado FROM inscripcion WHERE id_empresa = 'cc3' AND estado = 'activa'`).all() as any[];
  raw2.close();
  assert.equal(ins.length, 1);
  assert.equal(ins[0].id_campana, idCampana);
});

test('cambiarCadencia sin ninguna accion (ni idCampana ni reprograma) lanza: no es un no-op silencioso', () => {
  seedEmpresa('cc4');
  assert.throws(() => cambiarCadencia({ idEmpresa: 'cc4' } as any, 1));
});

test('cambiarCadencia respeta el guard de organizacion', () => {
  seedEmpresa('cc5');
  assert.throws(() => cambiarCadencia({ idEmpresa: 'cc5', proximoFollowUp: '2026-08-01' }, 999), /otra organizacion|no existe/);
});

test.after(() => borrarDbPrueba(dbPath));
