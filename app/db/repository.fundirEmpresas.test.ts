// T4: fundirEmpresas (Fase 0 dedup Notion). Decision revisada 2026-07-14: el
// sobreviviente conserva el NIT como identidad pero nombre_oficial pasa a ser el
// nombre de NOTION (display en toda la app); nombre_legal guarda la razon social
// original del NIT, solo para referencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { fundirEmpresas } = await import('./repository.ts');

function seedEmpresa(id: string, nombreOficial: string, tipoId = 'nit') {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, ?, ?, ?, 'lead', 1)`,
    )
    .run(id, tipoId, nombreOficial, nombreOficial.toLowerCase());
  raw.close();
}

function seedContacto(idEmpresa: string, nombre: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO contacto (id_empresa, nombre, fuente) VALUES (?, ?, 'notion')`)
    .run(idEmpresa, nombre);
  raw.close();
}

function seedToque(idEmpresa: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO toque (id_empresa, fecha, fuente, id_organizacion) VALUES (?, '2026-07-01', 'cockpit', 1)`)
    .run(idEmpresa);
  raw.close();
}

function leerEmpresa(id: string) {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT * FROM empresa WHERE id_empresa = ?').get(id) as Record<string, unknown> | undefined;
  raw.close();
  return fila;
}

function contarFilas(tabla: string, idEmpresa: string): number {
  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT COUNT(*) as n FROM ${tabla} WHERE id_empresa = ?`).get(idEmpresa) as { n: number };
  raw.close();
  return fila.n;
}

test('mueve contactos y toques del absorbido al sobreviviente, y aplica la politica de nombre', () => {
  seedEmpresa('901715847', 'Celsia Internet S.A.S.', 'nit');
  seedEmpresa('ntn-8119deb48bf9', 'CELSIA INTERNET S.A.S.', 'interno');
  seedContacto('ntn-8119deb48bf9', 'Juan Perez');
  seedToque('ntn-8119deb48bf9');

  fundirEmpresas('901715847', ['ntn-8119deb48bf9'], 'CELSIA INTERNET S.A.S.');

  assert.equal(contarFilas('contacto', '901715847'), 1);
  assert.equal(contarFilas('toque', '901715847'), 1);
  assert.equal(contarFilas('contacto', 'ntn-8119deb48bf9'), 0);

  const sobrevive = leerEmpresa('901715847');
  assert.equal(sobrevive?.nombre_oficial, 'CELSIA INTERNET S.A.S.');
  assert.equal(sobrevive?.nombre_legal, 'Celsia Internet S.A.S.');

  const absorbido = leerEmpresa('ntn-8119deb48bf9');
  assert.equal(absorbido?.opera_bajo_id, '901715847');
});

test('deja un alias con el nombre del absorbido', () => {
  seedEmpresa('901403469', 'WINS SOLUCIONES SAS', 'nit');
  seedEmpresa('ntn-8ea10df5716e', 'Wins Soluciones SAS', 'interno');

  fundirEmpresas('901403469', ['ntn-8ea10df5716e'], 'Wins Soluciones SAS');

  const raw = new Database(dbPath);
  const alias = raw.prepare('SELECT alias, fuente FROM empresa_alias WHERE id_empresa = ?').get('901403469') as
    | { alias: string; fuente: string }
    | undefined;
  raw.close();

  assert.equal(alias?.alias, 'Wins Soluciones SAS');
  assert.equal(alias?.fuente, 'dedup');
});

test('correr dos veces no duplica alias ni vuelve a mover nada (idempotente)', () => {
  seedEmpresa('900014381', 'CABLE NET S.A.S.', 'nit');
  seedEmpresa('9990000002', 'Cablenet SAS', 'interno');
  seedContacto('9990000002', 'Ana Ruiz');

  fundirEmpresas('900014381', ['9990000002'], 'Cablenet SAS');
  fundirEmpresas('900014381', ['9990000002'], 'Cablenet SAS');

  const raw = new Database(dbPath);
  const aliases = raw.prepare('SELECT COUNT(*) as n FROM empresa_alias WHERE id_empresa = ?').get('900014381') as { n: number };
  raw.close();

  assert.equal(aliases.n, 1);
  assert.equal(contarFilas('contacto', '900014381'), 1);
});

test('dos absorbidos con el mismo NIT (caso Celsia: dos sinteticos) no se pisan entre si', () => {
  seedEmpresa('901715847-b', 'Celsia Internet S.A.S.', 'nit');
  seedEmpresa('ntn-a', 'CELSIA INTERNET S.A.S.', 'interno');
  seedEmpresa('ntn-b', 'CELSIA', 'interno');

  fundirEmpresas('901715847-b', ['ntn-a', 'ntn-b'], 'CELSIA INTERNET S.A.S.');

  assert.equal(leerEmpresa('ntn-a')?.opera_bajo_id, '901715847-b');
  assert.equal(leerEmpresa('ntn-b')?.opera_bajo_id, '901715847-b');

  const raw = new Database(dbPath);
  const aliases = raw.prepare('SELECT alias FROM empresa_alias WHERE id_empresa = ? ORDER BY alias').all('901715847-b') as { alias: string }[];
  raw.close();
  assert.deepEqual(aliases.map((a) => a.alias), ['CELSIA', 'CELSIA INTERNET S.A.S.']);
});

test('rechaza fundir contra un sobreviviente que ya esta muerto (CABLETELCO, 2026-07-15)', () => {
  seedEmpresa('815001640', 'Cable Cauca-Home TV', 'nit');
  seedEmpresa('900552398', 'CABLE Y TELECOMUNICACIONES DE COLOMBIA S.A.S CABLETELCO', 'nit');
  fundirEmpresas('815001640', ['900552398'], 'Cable Cauca-Home TV'); // 900552398 ya fundida

  seedEmpresa('ntn-cabletelco-nueva', 'CABLE Y TELECOMUNICACIONES CABLETELCO', 'interno');
  assert.throws(
    () => fundirEmpresas('900552398', ['ntn-cabletelco-nueva'], 'CABLETELCO'),
    /ya esta fundido en 815001640/,
    'fundir contra una fila ya muerta dejaria al absorbido nuevo colgado de una identidad invisible (EMPRESA_VIVA la filtra)',
  );
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
