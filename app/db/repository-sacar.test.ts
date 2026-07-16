import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, dbReal, dbPruebas } from './index.ts';
import { inscripcion } from './schema.ts';
import { marcarModoPrueba } from '../lib/modo-prueba.ts';
import { marcarSoloLectura } from '../lib/read-only.ts';
import { sacarInscripcionDeCampana } from './repository.ts';

const DDL = sql`
  CREATE TABLE IF NOT EXISTS inscripcion (
    id_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT,
    id_campana INTEGER NOT NULL,
    id_empresa TEXT NOT NULL,
    estado TEXT NOT NULL,
    paso_actual INTEGER,
    fecha_inscripcion TEXT,
    fecha_fin TEXT,
    motivo_fin TEXT,
    created_at TEXT,
    updated_at TEXT
  )
`;
dbReal.run(DDL);
dbPruebas.run(DDL);

test('sacarInscripcionDeCampana pausa la inscripcion con motivo manual', () => {
  marcarSoloLectura(false);
  marcarModoPrueba(true);
  dbPruebas.run(sql`INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado) VALUES (900, 1, 'prueba-x', 'activa')`);

  sacarInscripcionDeCampana(900);

  const fila = db.select().from(inscripcion).where(sql`id_inscripcion = 900`).get();
  assert.equal(fila?.estado, 'pausada');
  assert.match(fila?.motivoFin ?? '', /manual/i);
});
