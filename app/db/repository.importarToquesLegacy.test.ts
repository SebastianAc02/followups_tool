// T14: legacy toques desde la seccion "## Toques" del export de Notion.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  empresaYaTieneToquesNotionImportados,
  toquesExistentesParaImportarLegacy,
  aplicarImportacionToquesLegacy,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'lead', 1)`,
  ).run(id, id, id.toLowerCase());
  db.close();
}

function seedToquePlaceholder(idEmpresa: string, fecha: string) {
  const db = raw();
  const info = db
    .prepare(`INSERT INTO toque (id_empresa, fecha, canal, que_paso, fuente, id_organizacion) VALUES (?, ?, 'llamada', 'hubo llamada', 'notion_seed', 1)`)
    .run(idEmpresa, fecha);
  db.close();
  return Number(info.lastInsertRowid);
}

test('actualiza el placeholder del baseline en el mismo registro (no duplica el evento)', () => {
  const idEmpresa = 'e-spacom';
  seedEmpresa(idEmpresa);
  const idPlaceholder = seedToquePlaceholder(idEmpresa, 'June 26, 2026');

  aplicarImportacionToquesLegacy(idEmpresa, 1, [
    {
      accion: 'actualizar',
      idToque: idPlaceholder,
      fila: { fechaRaw: '2026-06-26', canal: 'llamada', quePaso: 'Conectamos con Efraín.', transcriptUrl: null, transcriptTexto: 'Granola (pendiente de sync)' },
    },
  ]);

  const db = raw();
  const fila = db.prepare('SELECT fecha, canal, que_paso, fuente, transcript_url FROM toque WHERE id_toque = ?').get(idPlaceholder) as any;
  const total = db.prepare('SELECT COUNT(*) n FROM toque WHERE id_empresa = ?').get(idEmpresa) as any;
  db.close();

  assert.equal(fila.fecha, '2026-06-26');
  assert.equal(fila.que_paso, 'Conectamos con Efraín. (Granola (pendiente de sync))');
  assert.equal(fila.fuente, 'notion_toques');
  assert.equal(fila.transcript_url, null);
  assert.equal(total.n, 1, 'no se creo una fila nueva, se enriquecio la existente');
});

test('inserta un toque nuevo para una fila que el baseline nunca sembro, con transcript_url + proveedor', () => {
  const idEmpresa = 'e-spacom-2';
  seedEmpresa(idEmpresa);
  const idPlaceholder = seedToquePlaceholder(idEmpresa, 'June 26, 2026');

  aplicarImportacionToquesLegacy(idEmpresa, 1, [
    { accion: 'actualizar', idToque: idPlaceholder, fila: { fechaRaw: '2026-06-26', canal: 'llamada', quePaso: 'Llamada real.', transcriptUrl: null, transcriptTexto: null } },
    { accion: 'insertar', fila: { fechaRaw: '2026-06-26', canal: 'reunion', quePaso: 'Se tuvo la reunión.', transcriptUrl: 'https://tldv.io/app/meetings/abc', transcriptTexto: null } },
  ]);

  const db = raw();
  const filas = db.prepare('SELECT canal, que_paso, transcript_url, transcript_proveedor, fuente FROM toque WHERE id_empresa = ? ORDER BY id_toque').all(idEmpresa) as any[];
  db.close();

  assert.equal(filas.length, 2);
  assert.equal(filas[1].canal, 'reunion');
  assert.equal(filas[1].transcript_url, 'https://tldv.io/app/meetings/abc');
  assert.equal(filas[1].transcript_proveedor, 'tldv');
  assert.equal(filas[1].fuente, 'notion_toques');
});

test('sin placeholder existente, inserta todas las filas de Notion', () => {
  const idEmpresa = 'e-punto-red';
  seedEmpresa(idEmpresa);

  aplicarImportacionToquesLegacy(idEmpresa, 1, [
    { accion: 'insertar', fila: { fechaRaw: 'oct-2025 (aprox)', canal: null, quePaso: 'Primer contacto.', transcriptUrl: null, transcriptTexto: null } },
    { accion: 'insertar', fila: { fechaRaw: '2-jul 2026', canal: 'llamada', quePaso: 'Llamada previa.', transcriptUrl: null, transcriptTexto: 'Resumen en Granola' } },
  ]);

  const db = raw();
  const total = db.prepare('SELECT COUNT(*) n FROM toque WHERE id_empresa = ?').get(idEmpresa) as any;
  db.close();

  assert.equal(total.n, 2);
});

test('empresaYaTieneToquesNotionImportados: idempotencia -- true solo despues de correr la importacion', () => {
  const idEmpresa = 'e-idempotencia';
  seedEmpresa(idEmpresa);
  const idPlaceholder = seedToquePlaceholder(idEmpresa, 'June 26, 2026');

  assert.equal(empresaYaTieneToquesNotionImportados(idEmpresa), false);

  aplicarImportacionToquesLegacy(idEmpresa, 1, [
    { accion: 'actualizar', idToque: idPlaceholder, fila: { fechaRaw: '2026-06-26', canal: 'llamada', quePaso: 'Real.', transcriptUrl: null, transcriptTexto: null } },
  ]);

  assert.equal(empresaYaTieneToquesNotionImportados(idEmpresa), true);
});

test('toquesExistentesParaImportarLegacy proyecta idToque/quePaso/fuente ordenados por id_toque', () => {
  const idEmpresa = 'e-orden';
  seedEmpresa(idEmpresa);
  const id1 = seedToquePlaceholder(idEmpresa, 'June 1, 2026');
  const id2 = seedToquePlaceholder(idEmpresa, 'June 2, 2026');

  const existentes = toquesExistentesParaImportarLegacy(idEmpresa);

  assert.deepEqual(existentes.map((e) => e.idToque), [id1, id2]);
  assert.ok(existentes.every((e) => e.fuente === 'notion_seed' && e.quePaso === 'hubo llamada'));
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
