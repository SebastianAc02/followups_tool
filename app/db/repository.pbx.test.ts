// Fase 3 (Task 3.2) del bucle PBX: empresasEnPBX / guardarProximoPasoPBX / graduarDePBX.
// DB propia y aislada (mismo motivo que repository.readiness.test.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { empresasEnPBX, guardarProximoPasoPBX, graduarDePBX } = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  const insEmpresa = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'isp')`,
  );
  insEmpresa.run('A', 'Empresa A', 'empresa-a'); // solo oficina (no-KDM) -> PBX
  insEmpresa.run('B', 'Empresa B', 'empresa-b'); // KDM con telefono -> NO PBX
  insEmpresa.run('C', 'Empresa C', 'empresa-c'); // sin contactos -> PBX

  const insContacto = raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, email, telefono, fuente)
     VALUES (?, ?, ?, ?, ?, 'seed')`,
  );
  insContacto.run('A', 'Recepcion', 0, null, '3001111111');
  insContacto.run('B', 'Gerente', 1, null, '3002222222');
  raw.close();
}
seed();

test('empresasEnPBX trae solo las empresas sin KDM alcanzable', () => {
  const filas = empresasEnPBX(1);
  const ids = filas.map((f) => f.id).sort();
  assert.deepEqual(ids, ['A', 'C']);
});

test('empresasEnPBX no ve empresas de otra organizacion', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, categoria, organizacion_activa_id)
       VALUES ('D', 'nit', 'Empresa D', 'empresa-d', 'activo', 'isp', 2)`,
    )
    .run();
  raw.close();

  const filas = empresasEnPBX(1);
  assert.ok(!filas.some((f) => f.id === 'D'));
});

test('guardarProximoPasoPBX escribe proximoPaso/proximoCanal/proximoFollowUpFecha/pbxForma', () => {
  guardarProximoPasoPBX(
    'A',
    { forma: 'llamar_conmutador', canal: 'llamada', diasSugeridos: null, nota: 'Llamar al conmutador' },
    1,
  );

  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT proximo_paso, proximo_canal, pbx_forma FROM empresa WHERE id_empresa = 'A'`).get();
  raw.close();

  assert.deepEqual(fila, {
    proximo_paso: 'Llamar al conmutador',
    proximo_canal: 'llamada',
    pbx_forma: 'llamar_conmutador',
  });
});

test('graduarDePBX inserta el contacto KDM, limpia pbx_forma y saca la empresa de PBX', () => {
  guardarProximoPasoPBX(
    'C',
    { forma: 'conseguir_numero', canal: null, diasSugeridos: null, nota: 'Conseguir el numero' },
    1,
  );

  graduarDePBX('C', { nombre: 'Nueva KDM', telefono: '3009999999', email: null }, 1);

  const raw = new Database(dbPath);
  const empresaFila = raw.prepare(`SELECT pbx_forma FROM empresa WHERE id_empresa = 'C'`).get() as {
    pbx_forma: string | null;
  };
  const contactoFila = raw
    .prepare(`SELECT nombre, es_key_decision_maker, telefono FROM contacto WHERE id_empresa = 'C'`)
    .get();
  raw.close();

  assert.equal(empresaFila.pbx_forma, null);
  assert.deepEqual(contactoFila, { nombre: 'Nueva KDM', es_key_decision_maker: 1, telefono: '3009999999' });

  const filas = empresasEnPBX(1);
  assert.ok(!filas.some((f) => f.id === 'C'));
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
