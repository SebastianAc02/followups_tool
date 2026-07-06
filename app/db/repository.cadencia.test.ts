// V4.2: pruebas de persistencia de cadencias (crearCadencia + getCadencia + listar).
// DB de archivo temporal, nunca isps.db real.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, getCadencia, listarCadencias } = await import('./repository.ts');

test('crearCadencia inserta cadencia + pasos + una version default por paso', () => {
  const id = crearCadencia({
    nombre: 'ISP outbound',
    descripcion: 'la cadencia real',
    pasos: [
      { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Me presento', cuerpo: 'Hola' },
      { orden: 2, diaOffset: 3, canal: 'whatsapp', cuerpo: 'Segui por aca' },
    ],
  });

  const raw = new Database(dbPath);
  const cad = raw.prepare('SELECT * FROM cadencia WHERE id_cadencia = ?').get(id) as any;
  assert.equal(cad.nombre, 'ISP outbound');
  assert.equal(cad.activa, 1);

  const pasos = raw.prepare('SELECT * FROM paso_cadencia WHERE id_cadencia = ? ORDER BY orden').all(id) as any[];
  assert.equal(pasos.length, 2);
  assert.equal(pasos[0].dia_offset, 0);
  assert.equal(pasos[1].canal, 'whatsapp');

  // cada paso trae exactamente una version default con el copy.
  for (const p of pasos) {
    const versiones = raw.prepare('SELECT * FROM version_paso WHERE id_paso = ?').all(p.id_paso) as any[];
    assert.equal(versiones.length, 1);
    assert.equal(versiones[0].es_default, 1);
    assert.equal(versiones[0].peso, 1);
  }
  const v0 = raw.prepare('SELECT * FROM version_paso WHERE id_paso = ?').get(pasos[0].id_paso) as any;
  assert.equal(v0.asunto, 'Me presento');
  assert.equal(v0.cuerpo, 'Hola');
  raw.close();
});

test('getCadencia devuelve el template consultable: cabecera + pasos con su copy default', () => {
  const id = crearCadencia({
    nombre: 'Reactivacion',
    pasos: [{ orden: 1, diaOffset: 0, canal: 'llamada', objetivo: 'reenganchar', cuerpo: 'guion' }],
  });

  const t = getCadencia(id);
  assert.ok(t);
  assert.equal(t!.cadencia.nombre, 'Reactivacion');
  assert.equal(t!.pasos.length, 1);
  assert.equal(t!.pasos[0].canal, 'llamada');
  assert.equal(t!.pasos[0].objetivo, 'reenganchar');
  assert.equal(t!.pasos[0].cuerpo, 'guion');
  assert.ok(t!.pasos[0].idVersion, 'el paso trae su version default enlazada');
});

test('getCadencia de un id inexistente devuelve null', () => {
  assert.equal(getCadencia(99999), null);
});

test('crearCadencia rechaza canal fuera de las 4 salidas (validacion de dominio)', () => {
  assert.throws(
    () => crearCadencia({ nombre: 'X', pasos: [{ orden: 1, diaOffset: 0, canal: 'telegram' } as any] }),
    /invalid|enum|telegram/i,
  );
});

test('crearCadencia rechaza una cadencia sin pasos', () => {
  assert.throws(() => crearCadencia({ nombre: 'Vacia', pasos: [] }), /al menos un paso/);
});

// Parte 3 campanas: firmaApollo y variables (del parser) se persisten en la version
// default y getCadencia los expone listos para la pantalla del toque.
test('crearCadencia persiste firmaApollo y variables; getCadencia los expone', () => {
  const id = crearCadencia({
    nombre: 'Con copy personalizado',
    pasos: [
      {
        orden: 1,
        diaOffset: 0,
        canal: 'correo',
        asunto: 'Hola [nombre]',
        cuerpo: 'Somos [empresa].',
        variables: ['nombre', 'empresa'],
        firmaApollo: true,
      },
    ],
  });

  const t = getCadencia(id);
  assert.ok(t);
  assert.deepEqual(t!.pasos[0].variables, ['nombre', 'empresa']);
  assert.equal(t!.pasos[0].firmaApollo, true);
});

test('crearCadencia sin variables/firmaApollo (paso armado a mano) defaultea vacio/false', () => {
  const id = crearCadencia({ nombre: 'Sin copy extra', pasos: [{ orden: 1, diaOffset: 0, canal: 'llamada' }] });
  const t = getCadencia(id);
  assert.ok(t);
  assert.deepEqual(t!.pasos[0].variables, []);
  assert.equal(t!.pasos[0].firmaApollo, false);
});

test('listarCadencias trae el conteo de pasos de cada una', () => {
  const filas = listarCadencias();
  const outbound = filas.find((f) => f.nombre === 'ISP outbound');
  assert.ok(outbound);
  assert.equal(outbound!.pasos, 2);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
