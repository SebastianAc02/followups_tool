// quitar_alias: borra UN alias mal puesto en una cuenta. Lo que estos tests protegen:
//   - que el seco no escriba nada (ni el alias ni la auditoria);
//   - que aplicar borre solo esa fila, deje la fila entera en auditoria_campo y devuelva los alias releidos;
//   - que los caminos sin estado valido fallen en vez de inventar: alias que no es de esa cuenta,
//     cuenta inexistente, cuenta de otra organizacion, alias vacio y alias que calza con dos filas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();

// auditoria_campo viene de las migraciones reales, igual que en produccion.
{
  const raw = new Database(dbPath);
  const dir = path.join(process.cwd(), 'drizzle');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const contenido = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!contenido.includes('auditoria_campo')) continue;
    for (const stmt of contenido.split('--> statement-breakpoint')) if (stmt.trim()) raw.exec(stmt);
  }
  raw.close();
}

process.env.ISPS_DB_PATH = dbPath;

const { quitarAliasTool, buscarEmpresaTool } = await import('./tools.ts');
const { TOOLS_ESCRITURA, TOOLS_LECTURA } = await import('./server.ts');

const ORG = 7702;

function exec(sqlText: string, ...params: unknown[]) {
  const raw = new Database(dbPath);
  raw.prepare(sqlText).run(...(params as any[]));
  raw.close();
}
function fila(sqlText: string, ...params: unknown[]): any {
  const raw = new Database(dbPath);
  const r = raw.prepare(sqlText).get(...(params as any[]));
  raw.close();
  return r;
}
function seed(id: string, nombre: string, org = ORG) {
  exec(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'lead', ?)`,
    id,
    nombre,
    nombre.toLowerCase(),
    org,
  );
}
function alias(id: string, a: string) {
  exec(`INSERT INTO empresa_alias (id_empresa, alias, fuente, confianza, created_at) VALUES (?, ?, 'notion', 'alta', '2026-07-20')`, id, a);
}
const aliasDe = (id: string) => {
  const raw = new Database(dbPath);
  const r = raw.prepare(`SELECT alias FROM empresa_alias WHERE id_empresa = ? ORDER BY id_alias`).all(id) as { alias: string }[];
  raw.close();
  return r.map((x) => x.alias);
};
const nAuditoria = () => fila(`SELECT count(*) AS n FROM auditoria_campo WHERE tabla = 'empresa_alias'`).n as number;

test.after(() => borrarDbPrueba(dbPath));

test('quitar_alias es de escritura, nunca de lectura', () => {
  assert.ok((TOOLS_ESCRITURA as readonly string[]).includes('quitar_alias'));
  assert.ok(!(TOOLS_LECTURA as readonly string[]).includes('quitar_alias'));
});

// El caso que origino la accion: Intercol con el alias de Isaac Network, que tiene su propia cuenta.
seed('901269582', 'INTERCOL WISP S.A.S.');
seed('901915653', 'ISAAC-NETWORK S.A.S');
alias('901269582', 'Intercol');
alias('901269582', 'Isaac Network');
alias('901915653', 'Isaac Network');

test('en seco: devuelve la fila que borraria y no escribe nada', () => {
  const auditoriaAntes = nAuditoria();
  const r = quitarAliasTool({ idEmpresa: '901269582', alias: 'Isaac Network' }, ORG);
  assert.equal(r.aplicado, false);
  assert.equal(r.quitado.alias, 'Isaac Network');
  assert.equal(r.quitado.fuente, 'notion');
  assert.deepEqual(r.aliasAntes, ['Intercol', 'Isaac Network']);
  assert.deepEqual(r.aliasDespues, ['Intercol']);
  assert.deepEqual(aliasDe('901269582'), ['Intercol', 'Isaac Network']);
  assert.equal(nAuditoria(), auditoriaAntes);
});

test('aplicar: borra solo esa fila, audita la fila entera y devuelve los alias releidos', () => {
  const r = quitarAliasTool({ idEmpresa: '901269582', alias: '  isaac network ', aplicar: true }, ORG);
  assert.equal(r.aplicado, true);
  assert.deepEqual(r.aliasDespues, ['Intercol']);
  assert.deepEqual(aliasDe('901269582'), ['Intercol']);
  // La otra empresa conserva su alias.
  assert.deepEqual(aliasDe('901915653'), ['Isaac Network']);

  const a = fila(`SELECT * FROM auditoria_campo WHERE tabla = 'empresa_alias' ORDER BY id DESC LIMIT 1`);
  assert.equal(a.id_registro, '901269582');
  assert.equal(a.campo, 'alias');
  assert.equal(a.valor_nuevo, null);
  assert.equal(a.id_organizacion, ORG);
  const previo = JSON.parse(a.valor_anterior);
  assert.equal(previo.alias, 'Isaac Network');
  assert.equal(previo.id_alias, r.quitado.idAlias);

  // buscar_empresa ya no trae a Intercol por el frente alias.
  const b = buscarEmpresaTool({ nombre: 'Isaac Network' });
  const intercol = b.candidatos.find((c) => c.idEmpresa === '901269582');
  assert.ok(!intercol || intercol.confianza !== 'alta', 'Intercol no deberia salir con confianza alta');
});

test('falla si el alias no es de esa cuenta, y lista los que si tiene', () => {
  assert.throws(
    () => quitarAliasTool({ idEmpresa: '901269582', alias: 'Isaac Network', aplicar: true }, ORG),
    /no es alias de 901269582.*"Intercol"/,
  );
});

test('falla si la cuenta no existe', () => {
  assert.throws(() => quitarAliasTool({ idEmpresa: '900000001', alias: 'X' }, ORG), /empresa_no_encontrada/);
});

test('falla si la cuenta es de otra organizacion', () => {
  seed('900000002', 'OTRA ORG SAS', 9999);
  alias('900000002', 'Otra');
  assert.throws(
    () => quitarAliasTool({ idEmpresa: '900000002', alias: 'Otra', aplicar: true }, ORG),
    /empresa_no_encontrada/,
  );
  assert.deepEqual(aliasDe('900000002'), ['Otra']);
});

test('falla con alias vacio', () => {
  assert.throws(() => quitarAliasTool({ idEmpresa: '901269582', alias: '   ' }, ORG), /alias vacio/);
});

test('falla si el alias calza con mas de una fila de la cuenta y no borra ninguna', () => {
  seed('900000003', 'DUPLICADA SAS');
  alias('900000003', 'Dupli');
  alias('900000003', 'dupli ');
  const auditoriaAntes = nAuditoria();
  assert.throws(
    () => quitarAliasTool({ idEmpresa: '900000003', alias: 'Dupli', aplicar: true }, ORG),
    /calza con 2 filas/,
  );
  assert.deepEqual(aliasDe('900000003'), ['Dupli', 'dupli ']);
  assert.equal(nAuditoria(), auditoriaAntes);
});
