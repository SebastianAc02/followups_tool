// Pruebas de Repository para actualizarCampoCalificacion (Parte 1 multi-organizacion:
// antes sin test dedicado).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actualizarCampoCalificacion } = await import('./repository.ts');

function seedEmpresa(id: string, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?)`,
    )
    .run(id, organizacionActivaId);
  raw.close();
}

test('actualizarCampoCalificacion escribe el campo cuando el lead es de la organizacion que llama', () => {
  seedEmpresa('cal-1');
  actualizarCampoCalificacion('cal-1', 'crm', 'HubSpot', 1);

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT crm_software FROM empresa WHERE id_empresa = ?').get('cal-1') as any;
  assert.equal(fila.crm_software, 'HubSpot');
  raw.close();
});

test('actualizarCampoCalificacion rechaza si el lead esta activo en otra organizacion', () => {
  seedEmpresa('cal-2', 2);
  assert.throws(() => actualizarCampoCalificacion('cal-2', 'crm', 'HubSpot', 1), /organizacion/i);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
