// Trigger de auditoria de `empresa` (migracion 0015). Lo que se prueba aqui es el SQL REAL:
// el test lee el .sql de la migracion y lo ejecuta, no una copia del trigger escrita a mano.
// Si el trigger y esta prueba se desincronizan, es porque alguien borro la migracion.
//
// El caso que origino todo: Global IP (901174053) paso a on_hold y no quedo rastro, porque el
// cambio se escribio por fuera de actualizarEstadoNotion. Instrumentar la aplicacion no alcanza;
// el trigger dispara venga el UPDATE de donde venga.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getTableColumns } from 'drizzle-orm';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';
import { empresa } from './schema.ts';

// El trigger viejo que ya vive sobre `empresa` en isps.db, copiado literal de produccion
// (sqlite_master, verificado 2026-07-25). Se recrea aqui porque es la mitad del riesgo: hace
// UPDATE sobre la misma tabla que acaba de disparar el trigger.
const TRIGGER_VIEJO = `
CREATE TRIGGER empresa_updated_at
AFTER UPDATE ON empresa
FOR EACH ROW
BEGIN
    UPDATE empresa SET updated_at = datetime('now')
    WHERE id_empresa = NEW.id_empresa AND OLD.updated_at = NEW.updated_at;
END;`;

function sqlDeLaMigracion(): string {
  const dir = path.join(process.cwd(), 'drizzle');
  const archivo = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => path.join(dir, f))
    .find((f) => fs.readFileSync(f, 'utf8').includes('CREATE TRIGGER `empresa_auditoria_campo`'));
  assert.ok(archivo, 'no se encontro la migracion que crea empresa_auditoria_campo');
  return fs.readFileSync(archivo, 'utf8');
}

const MIGRACION = sqlDeLaMigracion();

function dbConAuditoria() {
  const ruta = crearDbPrueba();
  const db = new Database(ruta);
  db.exec(TRIGGER_VIEJO);
  // Mismo corte que usa el migrador de drizzle (readMigrationFiles).
  for (const stmt of MIGRACION.split('--> statement-breakpoint')) {
    if (stmt.trim()) db.exec(stmt);
  }
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
       estado_notion, owner, proximo_paso, organizacion_activa_id, updated_at)
     VALUES ('901174053','nit','Global IP','global ip','contactado','cierre_documentacion',
       'Sebastian','Llamar a Carlos', 1, '2026-07-15 10:00:00')`,
  ).run();
  const cerrar = () => {
    db.close();
    borrarDbPrueba(ruta);
  };
  return { db, cerrar };
}

const auditoria = (db: Database.Database) =>
  db
    .prepare('SELECT campo, valor_anterior, valor_nuevo, cambiado_en, id_registro, id_organizacion FROM auditoria_campo ORDER BY id')
    .all() as {
    campo: string;
    valor_anterior: string | null;
    valor_nuevo: string | null;
    cambiado_en: string;
    id_registro: string;
    id_organizacion: number | null;
  }[];

test('un UPDATE deja una fila por campo que cambio, con el antes y el despues', () => {
  const { db, cerrar } = dbConAuditoria();
  db.prepare("UPDATE empresa SET estado_notion='on_hold', owner='Felipe Castro' WHERE id_empresa='901174053'").run();

  const filas = auditoria(db);
  assert.equal(filas.length, 2);
  const estado = filas.find((f) => f.campo === 'estado_notion');
  assert.deepEqual(
    { ant: estado?.valor_anterior, nue: estado?.valor_nuevo },
    { ant: 'cierre_documentacion', nue: 'on_hold' },
  );
  assert.equal(filas.every((f) => f.id_registro === '901174053' && f.id_organizacion === 1), true);
  // ISO UTC con milisegundos, puesto por el DEFAULT de la tabla y no por el trigger.
  assert.match(filas[0].cambiado_en, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  cerrar();
});

test('un UPDATE que deja el mismo valor no escribe nada', () => {
  const { db, cerrar } = dbConAuditoria();
  db.prepare("UPDATE empresa SET estado_notion='cierre_documentacion', owner='Sebastian' WHERE id_empresa='901174053'").run();
  assert.equal(auditoria(db).length, 0);
  cerrar();
});

test('NULL cuenta como valor: se registra en los dos sentidos', () => {
  const { db, cerrar } = dbConAuditoria();
  db.prepare("UPDATE empresa SET owner=NULL WHERE id_empresa='901174053'").run();
  db.prepare("UPDATE empresa SET owner='Sebastian' WHERE id_empresa='901174053'").run();

  const filas = auditoria(db);
  assert.equal(filas.length, 2);
  assert.deepEqual([filas[0].valor_anterior, filas[0].valor_nuevo], ['Sebastian', null]);
  assert.deepEqual([filas[1].valor_anterior, filas[1].valor_nuevo], [null, 'Sebastian']);
  cerrar();
});

test('el trigger viejo sigue estampando updated_at y eso no ensucia la auditoria', () => {
  const { db, cerrar } = dbConAuditoria();
  db.prepare("UPDATE empresa SET estado_notion='on_hold' WHERE id_empresa='901174053'").run();

  const fila = db.prepare("SELECT updated_at FROM empresa WHERE id_empresa='901174053'").get() as { updated_at: string };
  assert.notEqual(fila.updated_at, '2026-07-15 10:00:00');
  assert.equal(auditoria(db).filter((f) => f.campo === 'updated_at').length, 0);
  assert.equal(auditoria(db).length, 1);
  cerrar();
});

test('con recursive_triggers encendido no se duplican filas ni se dispara el bucle desde la auditoria', () => {
  const { db, cerrar } = dbConAuditoria();
  // Por default esta apagado (asi corre produccion), pero la garantia no puede depender de eso.
  assert.deepEqual(db.pragma('recursive_triggers'), [{ recursive_triggers: 0 }]);
  db.pragma('recursive_triggers = ON');

  db.prepare("UPDATE empresa SET estado_notion='on_hold' WHERE id_empresa='901174053'").run();

  // El UPDATE interno de empresa_updated_at vuelve a disparar los triggers, y aun asi hay UNA
  // fila: ese UPDATE solo mueve updated_at, que no tiene rama en el trigger de auditoria.
  const filas = auditoria(db);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].campo, 'estado_notion');
  cerrar();
});

test('el trigger cubre todas las columnas de empresa menos updated_at', () => {
  // Este es el test que evita el punto ciego: si manana alguien agrega una columna a empresa y
  // no la agrega al trigger, ese campo cambiaria sin dejar rastro y nadie se enteraria.
  const cuerpo = MIGRACION.slice(MIGRACION.indexOf('CREATE TRIGGER `empresa_auditoria_campo`'));
  const cubiertas = new Set([...cuerpo.matchAll(/'empresa', NEW\.id_empresa, '([a-z0-9_]+)'/g)].map((m) => m[1]));

  const { db, cerrar } = dbConAuditoria();
  const reales = (db.prepare("SELECT name FROM pragma_table_info('empresa')").all() as { name: string }[])
    .map((r) => r.name)
    .filter((n) => n !== 'updated_at');
  cerrar();

  assert.deepEqual(reales.filter((c) => !cubiertas.has(c)), [], 'columnas de empresa sin auditar');
  assert.equal(cubiertas.has('updated_at'), false, 'updated_at NO se audita: seria una fila de ruido por cada UPDATE');

  // Segunda red, contra el schema de Drizzle: pilla la columna que se agrego a schema.ts aunque
  // el DDL de test-helpers se haya quedado atras.
  const mapeadas = Object.values(getTableColumns(empresa))
    .map((c) => c.name)
    .filter((n) => n !== 'updated_at');
  assert.deepEqual(mapeadas.filter((c) => !cubiertas.has(c)), [], 'columnas mapeadas en schema.ts sin auditar');
});
