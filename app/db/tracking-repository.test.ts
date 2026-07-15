import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { dbReal, dbPruebas } from './index.ts';
import { marcarModoPrueba } from '../lib/modo-prueba.ts';
import { marcarSoloLectura } from '../lib/read-only.ts';
import { aperturasPorCampana } from './repository.ts';

// evento_tracking, paso_inscripcion, destinatario, inscripcion: DDL minimo para el join.
const DDL = [
  sql`CREATE TABLE IF NOT EXISTS evento_tracking (id_evento INTEGER PRIMARY KEY AUTOINCREMENT, id_paso_inscripcion INTEGER NOT NULL, tipo TEXT NOT NULL, canal TEXT NOT NULL, proveedor_evento_id TEXT NOT NULL, detalle TEXT, fecha_evento TEXT, created_at TEXT)`,
  sql`CREATE TABLE IF NOT EXISTS paso_inscripcion (id_paso_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT, id_destinatario INTEGER NOT NULL, id_paso INTEGER NOT NULL, id_version INTEGER NOT NULL, canal TEXT NOT NULL, estado TEXT NOT NULL, intentos INTEGER NOT NULL DEFAULT 0)`,
  sql`CREATE TABLE IF NOT EXISTS destinatario (id_destinatario INTEGER PRIMARY KEY AUTOINCREMENT, id_inscripcion INTEGER NOT NULL, id_contacto INTEGER NOT NULL, estado TEXT NOT NULL DEFAULT 'activo')`,
  sql`CREATE TABLE IF NOT EXISTS inscripcion (id_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT, id_campana INTEGER NOT NULL, id_empresa TEXT NOT NULL, estado TEXT NOT NULL)`,
];
for (const ddl of DDL) { dbReal.run(ddl); dbPruebas.run(ddl); }

test('aperturasPorCampana cuenta destinatarios con al menos una apertura', () => {
  marcarSoloLectura(false);
  marcarModoPrueba(true);
  dbPruebas.run(sql`INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado) VALUES (10, 77, 'e1', 'activa')`);
  dbPruebas.run(sql`INSERT INTO destinatario (id_destinatario, id_inscripcion, id_contacto) VALUES (20, 10, 5)`);
  dbPruebas.run(sql`INSERT INTO paso_inscripcion (id_paso_inscripcion, id_destinatario, id_paso, id_version, canal, estado) VALUES (30, 20, 1, 1, 'correo', 'enviada')`);
  dbPruebas.run(sql`INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id) VALUES (30, 'abierto', 'correo', 'ev-1')`);

  const filas = aperturasPorCampana(77);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].idInscripcion, 10);
  assert.ok(filas[0].abrio, 'debe marcar abrio=true');
});
