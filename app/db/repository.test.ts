// Pruebas de Repository para registrarToque (V1.2).
// Corre con: node --experimental-strip-types --test app/db/repository.test.ts
// (desde la raíz del proyecto, para que node_modules resuelva better-sqlite3/drizzle).
//
// Usa una DB SQLite de archivo temporal (ver test-helpers.ts) con el subset de tablas
// reales que necesita registrarToque. NUNCA toca isps.db real.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToque } = await import('./repository.ts');

function seedEmpresa(idEmpresa: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo')`,
    )
    .run(idEmpresa);
  raw.close();
}

function leerRaw() {
  return new Database(dbPath);
}

test('caso 1: contesto_no con razonPerdida Precio y kdm nuevo crea toque + contacto enlazado', () => {
  seedEmpresa('emp-1');

  registrarToque({
    idEmpresa: 'emp-1',
    canal: 'llamada',
    resultado: 'contesto_no',
    razonPerdida: 'Precio',
    kdm: { nombre: 'Juan Perez', telefono: '3001234567' },
  });

  const raw = leerRaw();
  const toqueRow = raw.prepare('SELECT * FROM toque WHERE id_empresa = ?').get('emp-1') as any;
  assert.equal(toqueRow.resultado, 'contesto_no');
  assert.equal(toqueRow.razon_perdida, 'Precio');
  assert.ok(toqueRow.id_contacto, 'el toque debe enlazar a un contacto');

  const contactoRow = raw
    .prepare('SELECT * FROM contacto WHERE id_contacto = ?')
    .get(toqueRow.id_contacto) as any;
  assert.equal(contactoRow.es_key_decision_maker, 1);
  assert.equal(contactoRow.nombre, 'Juan Perez');
  assert.equal(contactoRow.telefono, '3001234567');
  raw.close();
});

test('caso 2: segundo registro con mismo idEmpresa + mismo telefono de kdm actualiza, no duplica', () => {
  seedEmpresa('emp-2');

  registrarToque({
    idEmpresa: 'emp-2',
    canal: 'llamada',
    resultado: 'contesto_no',
    razonPerdida: 'Precio',
    kdm: { nombre: 'Ana Gomez', telefono: '3009999999' },
  });

  registrarToque({
    idEmpresa: 'emp-2',
    canal: 'whatsapp',
    resultado: 'contesto_sigue_seguimiento',
    kdm: { nombre: 'Ana Gomez Actualizada', telefono: '3009999999' },
  });

  const raw = leerRaw();
  const contactos = raw.prepare('SELECT * FROM contacto WHERE id_empresa = ?').all('emp-2') as any[];
  assert.equal(contactos.length, 1, 'no debe crear un segundo contacto');
  assert.equal(contactos[0].nombre, 'Ana Gomez Actualizada');
  assert.equal(contactos[0].es_key_decision_maker, 1);

  const toques = raw.prepare('SELECT * FROM toque WHERE id_empresa = ?').all('emp-2') as any[];
  assert.equal(toques.length, 2);
  assert.ok(toques.every((t) => t.id_contacto === contactos[0].id_contacto));
  raw.close();
});

test('caso 3: contesto_no sin razonPerdida lanza error y no inserta nada', () => {
  seedEmpresa('emp-3');

  assert.throws(() => {
    registrarToque({
      idEmpresa: 'emp-3',
      canal: 'llamada',
      resultado: 'contesto_no',
    } as any);
  });

  const raw = leerRaw();
  const toques = raw.prepare('SELECT * FROM toque WHERE id_empresa = ?').all('emp-3') as any[];
  assert.equal(toques.length, 0);
  raw.close();
});

test('caso 4: resultado fuera de las 4 salidas lanza error y no inserta nada', () => {
  seedEmpresa('emp-4');

  assert.throws(() => {
    registrarToque({
      idEmpresa: 'emp-4',
      canal: 'llamada',
      resultado: 'invalido',
    } as any);
  });

  const raw = leerRaw();
  const toques = raw.prepare('SELECT * FROM toque WHERE id_empresa = ?').all('emp-4') as any[];
  assert.equal(toques.length, 0);
  raw.close();
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
