// Pruebas de Repository para el discovery de la cuenta (notas, brief) y el resumen del toque.
// El import dinamico no es cosmetico: el repository lee ISPS_DB_PATH al cargarse, asi que un
// import estatico arriba agarraria la DB equivocada.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { leerDiscovery, guardarDiscovery, guardarResumenToque, leerTranscriptResumen } = await import('./repository.ts');

function seedEmpresa(id: string, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'lead', ?)`,
    )
    .run(id, organizacionActivaId);
  raw.close();
}

function seedToque(idEmpresa: string): number {
  const raw = new Database(dbPath);
  const r = raw
    .prepare(
      `INSERT INTO toque (id_empresa, canal, que_paso, fuente, id_organizacion)
       VALUES (?, 'llamada', 'Conecto.', 'cockpit', 1)`,
    )
    .run(idEmpresa);
  raw.close();
  return Number(r.lastInsertRowid);
}

test('leerDiscovery devuelve string vacio cuando la empresa no tiene nada', () => {
  seedEmpresa('disc-1');
  assert.deepEqual(leerDiscovery('disc-1', 1), { notas: '', brief: '' });
});

test('guardarDiscovery escribe notas y brief, y leerDiscovery los devuelve', () => {
  seedEmpresa('disc-2');
  guardarDiscovery('disc-2', { notas: '10.000 usuarios. CRM Wispro.', brief: 'ISP de Cali.' }, 1);
  assert.deepEqual(leerDiscovery('disc-2', 1), { notas: '10.000 usuarios. CRM Wispro.', brief: 'ISP de Cali.' });
});

test('guardarDiscovery rechaza si la empresa esta activa en otra organizacion', () => {
  seedEmpresa('disc-3', 2);
  assert.throws(() => guardarDiscovery('disc-3', { notas: 'x', brief: 'y' }, 1), /organizacion/i);
});

test('guardarDiscovery rechaza si la empresa no existe', () => {
  assert.throws(() => guardarDiscovery('no-existe', { notas: 'x', brief: 'y' }, 1), /no existe/i);
});

test('leerDiscovery no filtra datos de una empresa de otra organizacion', () => {
  seedEmpresa('disc-3b', 2);
  const raw = new Database(dbPath);
  raw.prepare(`UPDATE empresa SET notas_discovery = 'secreto de otra org' WHERE id_empresa = 'disc-3b'`).run();
  raw.close();
  assert.deepEqual(leerDiscovery('disc-3b', 1), { notas: '', brief: '' });
});

test('guardarResumenToque escribe resumen y transcript_resumen', () => {
  seedEmpresa('disc-4');
  const idToque = seedToque('disc-4');
  guardarResumenToque(idToque, { resumen: 'Llamada de 40 minutos con Carlos.', transcriptResumen: 'crudo de granola' });

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT resumen, transcript_resumen FROM toque WHERE id_toque = ?').get(idToque) as any;
  raw.close();
  assert.equal(fila.resumen, 'Llamada de 40 minutos con Carlos.');
  assert.equal(fila.transcript_resumen, 'crudo de granola');
});

test('guardarResumenToque no pisa transcript_resumen cuando no se lo pasan', () => {
  seedEmpresa('disc-5');
  const idToque = seedToque('disc-5');
  guardarResumenToque(idToque, { resumen: 'primero', transcriptResumen: 'de granola' });
  guardarResumenToque(idToque, { resumen: 'segundo' });

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT resumen, transcript_resumen FROM toque WHERE id_toque = ?').get(idToque) as any;
  raw.close();
  assert.equal(fila.resumen, 'segundo');
  assert.equal(fila.transcript_resumen, 'de granola', 'el insumo de Granola no se pierde al reescribir el producto');
});

test('leerTranscriptResumen devuelve vacio para un toque dictado sin grabacion', () => {
  seedEmpresa('disc-6');
  const idToque = seedToque('disc-6');
  assert.equal(leerTranscriptResumen(idToque), '');
});

test('leerTranscriptResumen devuelve el insumo cacheado de Granola', () => {
  seedEmpresa('disc-7');
  const idToque = seedToque('disc-7');
  guardarResumenToque(idToque, { resumen: 'producto', transcriptResumen: 'insumo de granola' });
  assert.equal(leerTranscriptResumen(idToque), 'insumo de granola');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
