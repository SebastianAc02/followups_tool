// V6.1: pruebas de Repository para el registro de respuestas y su consulta desde
// /cola y /seguimiento. Mismo estilo que repository.tracking.test.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarRespuestaDetectada, marcarRespuestaVista, empresasConRespuestaPendiente } = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresaConContacto(id: string, nombreContacto: string, cargo: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'cat-1', 1)`,
  ).run(id, id, id.toLowerCase());
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, cargo, es_key_decision_maker, es_principal, fuente) VALUES (?, ?, ?, 0, 1, 'seed')`,
  ).run(id, nombreContacto, cargo);
  db.close();
}

seedEmpresaConContacto('e-resp-1', 'Ana Pérez', 'Gerente');
seedEmpresaConContacto('e-resp-2', 'Beto Ruiz', 'CEO');

test('registrarRespuestaDetectada inserta una fila con vista_en null', () => {
  registrarRespuestaDetectada(10, 'e-resp-1', 'correo');
  const db = raw();
  const fila = db.prepare('SELECT id_inscripcion, id_empresa, canal, vista_en FROM notificacion_respuesta WHERE id_inscripcion = 10').get() as any;
  db.close();
  assert.ok(fila);
  assert.strictEqual(fila.id_empresa, 'e-resp-1');
  assert.strictEqual(fila.canal, 'correo');
  assert.strictEqual(fila.vista_en, null);
});

test('empresasConRespuestaPendiente solo trae empresas con al menos una fila sin ver', () => {
  registrarRespuestaDetectada(20, 'e-resp-2', 'whatsapp');
  const pendientes = empresasConRespuestaPendiente(1);
  assert.ok(pendientes.some((p) => p.idEmpresa === 'e-resp-1'));
  assert.ok(pendientes.some((p) => p.idEmpresa === 'e-resp-2'));
});

test('empresasConRespuestaPendiente trae contacto/cargo/canal de la fila mas reciente', () => {
  const pendientes = empresasConRespuestaPendiente(1);
  const fila = pendientes.find((p) => p.idEmpresa === 'e-resp-2')!;
  assert.strictEqual(fila.contacto, 'Beto Ruiz');
  assert.strictEqual(fila.cargo, 'CEO');
  assert.strictEqual(fila.canal, 'whatsapp');
});

test('marcarRespuestaVista apaga el destaque de esa empresa (todas sus filas sin ver a la vez)', () => {
  registrarRespuestaDetectada(21, 'e-resp-2', 'correo'); // segunda respuesta de la misma empresa, sigue sin ver
  marcarRespuestaVista('e-resp-2');
  const pendientes = empresasConRespuestaPendiente(1);
  assert.ok(!pendientes.some((p) => p.idEmpresa === 'e-resp-2'), 'e-resp-2 ya no debe salir: ambas filas quedaron vistas');
  assert.ok(pendientes.some((p) => p.idEmpresa === 'e-resp-1'), 'e-resp-1 sigue pendiente, no se toco');
});

test('empresasConRespuestaPendiente esta scoped por organizacion', () => {
  const db = raw();
  db.prepare(`UPDATE empresa SET organizacion_activa_id = 2 WHERE id_empresa = 'e-resp-1'`).run();
  db.close();
  const pendientesOrg1 = empresasConRespuestaPendiente(1);
  const pendientesOrg2 = empresasConRespuestaPendiente(2);
  assert.ok(!pendientesOrg1.some((p) => p.idEmpresa === 'e-resp-1'));
  assert.ok(pendientesOrg2.some((p) => p.idEmpresa === 'e-resp-1'));
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
