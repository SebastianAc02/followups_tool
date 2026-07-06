import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 1) DB temporal ANTES de importar el repo (el singleton lee ISPS_DB_PATH al importar).
const tmp = join(mkdtempSync(join(tmpdir(), 'panel-')), 'test.db');
process.env.ISPS_DB_PATH = tmp;

const raw = new Database(tmp);
raw.exec(`
  CREATE TABLE toque (
    id_toque INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empresa TEXT NOT NULL,
    canal TEXT, resultado TEXT, fecha TEXT, fuente TEXT NOT NULL DEFAULT 'test'
  );
  CREATE TABLE cadencia (id_cadencia INTEGER PRIMARY KEY, nombre TEXT NOT NULL, activa INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE campana (id_campana INTEGER PRIMARY KEY, nombre TEXT NOT NULL, id_cadencia INTEGER NOT NULL, id_segmento INTEGER NOT NULL DEFAULT 1, estado TEXT NOT NULL DEFAULT 'borrador');
  CREATE TABLE inscripcion (id_inscripcion INTEGER PRIMARY KEY, id_campana INTEGER NOT NULL, id_empresa TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'activa');
`);
// Ventana de prueba: usaremos hoy='2026-01-15' -> rango [2026-01-06, 2026-01-14].
// Sembramos toques ISO dentro del rango, uno en fin de semana (2026-01-10 sabado),
// uno historico con formato Notion ("June 25, 2026") que NO debe contar, y uno fuera.
raw.exec(`
  INSERT INTO toque (id_empresa, canal, resultado, fecha) VALUES
    ('e1','llamada','contesto_reunion','2026-01-06T09:00:00.000Z'),
    ('e1','llamada','no_contesto','2026-01-07T09:00:00.000Z'),
    ('e2','whatsapp','contesto_no','2026-01-08T09:00:00.000Z'),
    ('e2','correo','contesto_sigue_seguimiento','2026-01-10T11:00:00.000Z'),
    ('e3','llamada','contesto_reunion','2026-01-14T16:00:00.000Z'),
    ('e3','llamada','no_contesto','June 25, 2026'),
    ('e4','llamada','no_contesto','2026-01-20T09:00:00.000Z');
  INSERT INTO cadencia (id_cadencia, nombre) VALUES (1,'Outbound T1'), (2,'On-hold');
  INSERT INTO campana (id_campana, nombre, id_cadencia, estado) VALUES (10,'T1 Q1',1,'borrador'), (20,'Reactivacion',2,'borrador');
  INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES
    (10,'e1','activa'), (10,'e2','activa'), (10,'e3','bloqueada'),
    (20,'e4','activa'), (20,'e5','finalizada');
`);
raw.close();

const repo = await import('./repository.ts');

test('contarToquesEnRango cuenta ISO en rango, incluye fin de semana, excluye historico y fuera', () => {
  // En [2026-01-06, 2026-01-14]: e1x2, e2x2 (uno sabado), e3x1 = 5. El "June 25, 2026"
  // no matchea el rango YYYY-MM-DD y queda fuera; el 2026-01-20 esta fuera del rango.
  assert.equal(repo.contarToquesEnRango('2026-01-06', '2026-01-14'), 5);
});

test('contarToquesEnDia cuenta solo ayer', () => {
  // ayer de hoy=2026-01-15 es 2026-01-14: solo e3 -> 1.
  assert.equal(repo.contarToquesEnDia('2026-01-15'), 1);
});

test('leadsTocadosEnRango cuenta empresas distintas', () => {
  // En el rango tocamos e1, e2, e3 -> 3 empresas distintas.
  assert.equal(repo.leadsTocadosEnRango('2026-01-06', '2026-01-14'), 3);
});

test('toquesPorCanal agrupa por canal dentro del rango', () => {
  const m = repo.toquesPorCanal('2026-01-06', '2026-01-14');
  assert.equal(m.llamada, 3);
  assert.equal(m.whatsapp, 1);
  assert.equal(m.correo, 1);
});

test('toquesPorResultado agrupa por resultado dentro del rango', () => {
  const m = repo.toquesPorResultado('2026-01-06', '2026-01-14');
  assert.equal(m.contesto_reunion, 2);
  assert.equal(m.contesto_sigue_seguimiento, 1);
  assert.equal(m.contesto_no, 1);
  assert.equal(m.no_contesto, 1);
});

test('campanasActivas cuenta campanas con al menos una inscripcion activa', () => {
  // campana 10 (e1,e2 activas) y 20 (e4 activa) -> 2.
  assert.equal(repo.campanasActivas(), 2);
});

test('inscripcionesActivas cuenta solo estado activa', () => {
  // activas: e1,e2 (camp10), e4 (camp20) = 3. bloqueada y finalizada no cuentan.
  assert.equal(repo.inscripcionesActivas(), 3);
});

test('empresasPorCadencia agrupa inscripciones activas por nombre de cadencia', () => {
  const filas = repo.empresasPorCadencia();
  const porNombre = Object.fromEntries(filas.map((f) => [f.cadencia, f.empresas]));
  assert.equal(porNombre['Outbound T1'], 2); // e1, e2 (e3 bloqueada no cuenta)
  assert.equal(porNombre['On-hold'], 1);      // e4 (e5 finalizada no cuenta)
});
