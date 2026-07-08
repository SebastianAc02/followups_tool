import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, agregarVersionPaso, versionesDePaso } = await import('./repository.ts');

const idCadencia = crearCadencia({
  nombre: 'Versiones',
  pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'A', cuerpo: 'copy A' }],
});

function idPasoUnico(): number {
  const raw = new Database(dbPath);
  const p = raw.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as any;
  raw.close();
  return p.id_paso;
}

test('versionesDePaso trae la activa primero, con asunto/cuerpo/fecha', () => {
  const idPaso = idPasoUnico();
  agregarVersionPaso(idPaso, { nombre: 'B', asunto: 'Asunto B', cuerpo: 'copy B', peso: 1, esDefault: false });

  const versiones = versionesDePaso(idPaso);
  assert.equal(versiones.length, 2);
  assert.equal(versiones[0].esDefault, true, 'la default va primero');
  assert.equal(versiones[0].asunto, 'A');
  assert.ok(versiones.some((v) => v.nombre === 'B' && v.cuerpo === 'copy B'));
});
