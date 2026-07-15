// T12: enriquecerDesdeNotion sobrescribe campos de empresa + usuarios estimados desde
// Notion, guardando el valor anterior en sync_cambios. Politica no destructiva: si Notion
// no trae dato para un campo (vacio/undefined), NO se pisa lo que ya hay en la DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { enriquecerDesdeNotion } = await import('./repository.ts');

function seedEmpresa(id: string, campos: Record<string, unknown> = {}, idOrg = 1) {
  const raw = new Database(dbPath);
  const base: Record<string, unknown> = {
    tipo_id: 'nit',
    nombre_oficial: id,
    nombre_normalizado: id.toLowerCase(),
    estado_comercial: 'lead',
    organizacion_activa_id: idOrg,
    ...campos,
  };
  const cols = ['id_empresa', ...Object.keys(base)];
  const placeholders = cols.map(() => '?').join(', ');
  raw
    .prepare(`INSERT INTO empresa (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(id, ...Object.keys(base).map((c) => base[c]));
  raw.close();
}

function leerEmpresa(id: string) {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT * FROM empresa WHERE id_empresa = ?').get(id) as Record<string, unknown> | undefined;
  raw.close();
  return fila;
}

function leerUsuarios(id: string) {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT * FROM empresa_usuarios WHERE id_empresa = ?').get(id) as Record<string, unknown> | undefined;
  raw.close();
  return fila;
}

function leerSyncCambios(idRegistro: string) {
  const raw = new Database(dbPath);
  const filas = raw.prepare('SELECT * FROM sync_cambios WHERE id_registro = ?').all(idRegistro) as Record<string, unknown>[];
  raw.close();
  return filas;
}

test('sobrescribe owner y guarda el valor anterior en sync_cambios', () => {
  seedEmpresa('own-1', { owner: 'Old Owner' });

  enriquecerDesdeNotion('own-1', { owner: 'Sebastian Acosta Molina' }, 1);

  assert.equal(leerEmpresa('own-1')?.owner, 'Sebastian Acosta Molina');

  const cambios = leerSyncCambios('own-1');
  const cambioOwner = cambios.find((c) => c.accion === 'sobrescribir:owner');
  assert.ok(cambioOwner, 'debe quedar un sync_cambios para owner');
  assert.match(String(cambioOwner!.detalle), /Old Owner/);
  assert.equal(cambioOwner!.fuente, 'notion');
});

test('respeta el casing canonico del owner (no normaliza)', () => {
  seedEmpresa('own-2', { owner: null });

  enriquecerDesdeNotion('own-2', { owner: 'Felipe Castro' }, 1);

  assert.equal(leerEmpresa('own-2')?.owner, 'Felipe Castro');
});

test('no destructivo: Notion vacio no pisa un valor real de la DB, ni loguea cambio', () => {
  seedEmpresa('nd-1', { crm_software: 'Wispro', pasarela_actual: 'Wompi' });

  enriquecerDesdeNotion('nd-1', { crm: '', pasarela: undefined }, 1);

  const emp = leerEmpresa('nd-1');
  assert.equal(emp?.crm_software, 'Wispro');
  assert.equal(emp?.pasarela_actual, 'Wompi');

  const cambios = leerSyncCambios('nd-1');
  assert.equal(cambios.length, 0, 'no debe loguear cambios cuando Notion no trae dato');
});

test('escribe usuarios_estimados (parsea coma de miles) con usuarios_est_fuente=notion', () => {
  seedEmpresa('usr-1');

  enriquecerDesdeNotion('usr-1', { usuariosEstimados: '5,000' }, 1);

  const usu = leerUsuarios('usr-1');
  assert.equal(usu?.usuarios_estimados, 5000);
  assert.equal(usu?.usuarios_est_fuente, 'notion');
});

test('usuarios blanco o no parseable no escribe empresa_usuarios', () => {
  seedEmpresa('usr-2');

  enriquecerDesdeNotion('usr-2', { usuariosEstimados: '' }, 1);
  assert.equal(leerUsuarios('usr-2'), undefined);

  enriquecerDesdeNotion('usr-2', { usuariosEstimados: 'N/A' }, 1);
  assert.equal(leerUsuarios('usr-2'), undefined);
});

test('sobrescribe varios campos a la vez y loguea uno por campo cambiado', () => {
  seedEmpresa('multi-1', { pasarela_actual: 'PayU', crm_software: 'Mikrowisp', proximo_paso: 'Llamar' });

  enriquecerDesdeNotion(
    'multi-1',
    { pasarela: 'Wompi', crm: 'Wispro', proximoPaso: 'Enviar contrato', fechaProximoPaso: '2026-08-01' },
    1,
  );

  const emp = leerEmpresa('multi-1');
  assert.equal(emp?.pasarela_actual, 'Wompi');
  assert.equal(emp?.crm_software, 'Wispro');
  assert.equal(emp?.proximo_paso, 'Enviar contrato');
  assert.equal(emp?.proximo_follow_up_fecha, '2026-08-01');

  const acciones = leerSyncCambios('multi-1').map((c) => c.accion).sort();
  assert.deepEqual(acciones, [
    'sobrescribir:crm_software',
    'sobrescribir:pasarela_actual',
    'sobrescribir:proximo_follow_up_fecha',
    'sobrescribir:proximo_paso',
  ]);
});

test('no loguea cambio cuando el valor de Notion es igual al que ya hay', () => {
  seedEmpresa('same-1', { owner: 'Thomas Schumacher' });

  enriquecerDesdeNotion('same-1', { owner: 'Thomas Schumacher' }, 1);

  assert.equal(leerSyncCambios('same-1').length, 0);
});

test('idempotente: correr dos veces solo loguea el cambio la primera vez', () => {
  seedEmpresa('idem-1', { crm_software: 'PayU' });

  enriquecerDesdeNotion('idem-1', { crm: 'Wispro' }, 1);
  enriquecerDesdeNotion('idem-1', { crm: 'Wispro' }, 1);

  const cambios = leerSyncCambios('idem-1').filter((c) => c.accion === 'sobrescribir:crm_software');
  assert.equal(cambios.length, 1);
  assert.equal(leerEmpresa('idem-1')?.crm_software, 'Wispro');
});

test('scope por organizacion: no toca una empresa de otra organizacion', () => {
  seedEmpresa('org-2', { owner: 'Old Owner' }, 2);

  enriquecerDesdeNotion('org-2', { owner: 'Nuevo' }, 1);

  assert.equal(leerEmpresa('org-2')?.owner, 'Old Owner');
  assert.equal(leerSyncCambios('org-2').length, 0);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
