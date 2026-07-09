// Subir/editar copy en Apollo (sesion 2026-07-08): pruebas de los lectores/escritores
// del Repository que alimentan EnvioAdapter.sincronizarCopy. El adaptador real contra
// Apollo se prueba en apollo.test.ts (fetch mockeado); aca solo la parte DB.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  guardarProveedorCampanaId,
  campanaParaSincronizarCopy,
  pasosParaSincronizarCopy,
  guardarSincronizacionCopy,
} = await import('./repository.ts');

const idCadencia = crearCadencia({
  nombre: 'Cadencia copy-apollo',
  pasos: [
    { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola {{nombre}}', cuerpo: 'cuerpo paso 1' },
    { orden: 2, diaOffset: 4, canal: 'correo', asunto: 'Seguimos', cuerpo: 'cuerpo paso 2' },
  ],
});

const idSegmento = guardarSegmento({ nombre: 'seg-copy-apollo', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } });
const idCampana = crearCampana({ nombre: 'Campana copy-apollo', idCadencia, idSegmento, fechaInicio: '2026-07-08' }, 1);

test('campanaParaSincronizarCopy es null si la campana todavia no tiene secuencia externa', () => {
  assert.equal(campanaParaSincronizarCopy(idCampana), null);
});

test('campanaParaSincronizarCopy devuelve idCadencia + proveedorCampanaId una vez creada la secuencia', () => {
  guardarProveedorCampanaId(idCampana, 'seq-copy-1', 1);

  assert.deepEqual(campanaParaSincronizarCopy(idCampana), { idCadencia, proveedorCampanaId: 'seq-copy-1' });
});

test('pasosParaSincronizarCopy trae los pasos en orden, con la version default y sin ids de Apollo todavia', () => {
  const pasos = pasosParaSincronizarCopy(idCadencia);

  assert.equal(pasos.length, 2);
  assert.deepEqual(
    pasos.map((p) => p.orden),
    [1, 2],
  );
  assert.equal(pasos[0].asunto, 'Hola {{nombre}}');
  assert.equal(pasos[0].cuerpo, 'cuerpo paso 1');
  assert.equal(pasos[0].proveedorStepId, null);
  assert.equal(pasos[0].proveedorTemplateId, null);
});

test('guardarSincronizacionCopy persiste proveedorStepId en paso_cadencia y proveedorTemplateId en version_paso', () => {
  const [p1, p2] = pasosParaSincronizarCopy(idCadencia);

  guardarSincronizacionCopy([
    { idPaso: p1.idPaso, idVersion: p1.idVersion, proveedorStepId: 'step-1', proveedorTemplateId: 'tpl-1' },
    { idPaso: p2.idPaso, idVersion: p2.idVersion, proveedorStepId: 'step-2', proveedorTemplateId: 'tpl-2' },
  ]);

  const releidos = pasosParaSincronizarCopy(idCadencia);
  assert.equal(releidos[0].proveedorStepId, 'step-1');
  assert.equal(releidos[0].proveedorTemplateId, 'tpl-1');
  assert.equal(releidos[1].proveedorStepId, 'step-2');
  assert.equal(releidos[1].proveedorTemplateId, 'tpl-2');

  const raw = new Database(dbPath);
  const filaVersion = raw.prepare('SELECT updated_at FROM version_paso WHERE id_version = ?').get(p1.idVersion) as { updated_at: string | null };
  raw.close();
  assert.ok(filaVersion.updated_at, 'guardarSincronizacionCopy deberia tocar updated_at de version_paso');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
