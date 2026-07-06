// Pruebas de Repository para terminosBusquedaTranscript y confirmarTranscript (V3.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { terminosBusquedaTranscript, confirmarTranscript } = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial)
       VALUES ('emp-1', 'nit', 'Cabletelco S.A.S.', 'cabletelco sas', 'lead')`,
    )
    .run();
  raw.prepare(`INSERT INTO empresa_alias (id_empresa, alias, fuente) VALUES ('emp-1', 'Cabletelco', 'manual')`).run();
  raw
    .prepare(
      `INSERT INTO contacto (id_contacto, id_empresa, nombre, telefono, fuente) VALUES (1, 'emp-1', 'Carlos', '3003751972', 'cockpit')`,
    )
    .run();
  raw
    .prepare(
      `INSERT INTO toque (id_toque, id_empresa, id_contacto, fecha, canal, resultado, fuente)
       VALUES (1, 'emp-1', 1, '2026-07-04T10:15:00.000Z', 'llamada', 'contesto_reunion', 'cockpit')`,
    )
    .run();
  raw.close();
}

seed();

test('terminosBusquedaTranscript arma nombre oficial, normalizado, alias y telefono del contacto', () => {
  const resultado = terminosBusquedaTranscript(1);
  assert.ok(resultado);
  assert.strictEqual(resultado.fecha, '2026-07-04T10:15:00.000Z');
  assert.ok(resultado.terminos.includes('Cabletelco S.A.S.'));
  assert.ok(resultado.terminos.includes('cabletelco sas'));
  assert.ok(resultado.terminos.includes('Cabletelco'));
  assert.ok(resultado.terminos.includes('3003751972'));
});

test('terminosBusquedaTranscript devuelve null si el toque no existe', () => {
  assert.strictEqual(terminosBusquedaTranscript(999), null);
});

test('confirmarTranscript escribe el puntero y el resumen en el toque', () => {
  confirmarTranscript(1, {
    proveedor: 'granola',
    transcriptId: 'not_abc123',
    titulo: 'Cabletelco - Llamada',
    fecha: '2026-07-04T10:00:00.000Z',
    resumen: 'hablamos de la propuesta',
    url: 'https://notes.granola.ai/d/abc',
  });

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT transcript_proveedor, transcript_id, transcript_url, que_paso FROM toque WHERE id_toque = 1').get() as {
    transcript_proveedor: string;
    transcript_id: string;
    transcript_url: string;
    que_paso: string;
  };
  raw.close();

  assert.strictEqual(fila.transcript_proveedor, 'granola');
  assert.strictEqual(fila.transcript_id, 'not_abc123');
  assert.strictEqual(fila.transcript_url, 'https://notes.granola.ai/d/abc');
  assert.strictEqual(fila.que_paso, 'hablamos de la propuesta');
});

test.after(() => borrarDbPrueba(dbPath));
