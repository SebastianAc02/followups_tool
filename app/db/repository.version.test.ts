// V4.4: pruebas de versiones A/B en la DB + integracion con el reparto del motor.
// Cierra la tarea: "un paso con 2 versiones reparte segun peso en el motor en seco".

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';
import { elegirVersionPorPeso } from '../core/motor-cadencia.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, agregarVersionPaso, versionesActivasDePaso, actualizarVersionPaso } = await import('./repository.ts');

// una cadencia de un paso; su version default nace con peso 1.
const idCadencia = crearCadencia({
  nombre: 'AB',
  pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'A', cuerpo: 'copy A' }],
});

function idPasoUnico(): number {
  const raw = new Database(dbPath);
  const p = raw.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as any;
  raw.close();
  return p.id_paso;
}

test('agregar una version B default apaga el default anterior; ambas quedan activas', () => {
  const idPaso = idPasoUnico();
  agregarVersionPaso(idPaso, { nombre: 'B', asunto: 'B', cuerpo: 'copy B', peso: 1, esDefault: true });

  const versiones = versionesActivasDePaso(idPaso);
  assert.equal(versiones.length, 2, 'A y B activas');
  const defaults = versiones.filter((v) => v.esDefault === 1);
  assert.equal(defaults.length, 1, 'solo una default');
  assert.equal(defaults[0].nombre, 'B', 'la default paso a ser B');
});

test('un paso con 2 versiones peso 1:1 reparte mitad y mitad en el motor en seco', () => {
  const idPaso = idPasoUnico();
  const versiones = versionesActivasDePaso(idPaso).map((v) => ({ id: v.id, peso: v.peso }));

  const cuenta = new Map<number, number>();
  for (let i = 0; i < 8; i++) {
    const id = elegirVersionPorPeso(versiones, i);
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  const conteos = [...cuenta.values()].sort();
  assert.deepEqual(conteos, [4, 4], 'reparto 1:1 sobre 8 destinatarios');
});

test('subir el peso de una version corre el reparto hacia ella (2:1)', () => {
  const idPaso = idPasoUnico();
  const versiones = versionesActivasDePaso(idPaso);
  // duplica el peso de la primera (queda 2:1)
  actualizarVersionPaso(versiones[0].id, { peso: 2 });

  const pesos = versionesActivasDePaso(idPaso).map((v) => ({ id: v.id, peso: v.peso }));
  const cuenta = new Map<number, number>();
  for (let i = 0; i < 6; i++) {
    const id = elegirVersionPorPeso(pesos, i);
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  assert.equal(cuenta.get(versiones[0].id), 4);
  assert.equal(cuenta.get(versiones[1].id), 2);
});

test('actualizarVersionPaso rechaza peso negativo o no entero (protege el reparto)', () => {
  const idPaso = idPasoUnico();
  const alguna = versionesActivasDePaso(idPaso)[0];
  assert.throws(() => actualizarVersionPaso(alguna.id, { peso: -1 }), /peso debe ser/);
  assert.throws(() => actualizarVersionPaso(alguna.id, { peso: 1.5 }), /peso debe ser/);
  // peso 0 SI se permite (apaga sin borrar)
  actualizarVersionPaso(alguna.id, { peso: 0 });
});

test('apagar una version (activa=0) la saca del reparto', () => {
  const idPaso = idPasoUnico();
  const versiones = versionesActivasDePaso(idPaso);
  actualizarVersionPaso(versiones[1].id, { activa: false });
  const activas = versionesActivasDePaso(idPaso);
  assert.equal(activas.length, 1);
  assert.equal(activas[0].id, versiones[0].id);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
