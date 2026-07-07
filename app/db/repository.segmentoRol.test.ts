// Parte 5 campanas: departamento (columna directa), rol (EXISTS sobre contacto) y
// personas (COUNT sobre contacto). DB propia y aislada (no la de repository.segmento.test.ts):
// empresasDeSegmento escanea toda la tabla empresa sin aislamiento, asi que compartir un
// fixture obliga a rastrear cada conteo exacto que ya usan otros tests; mas simple y mas
// robusto es una DB de archivo temporal solo para esta seccion.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { empresasDeSegmento } = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  const insEmpresa = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, departamento)
     VALUES (?, 'nit', ?, ?, 'activo', ?)`,
  );
  insEmpresa.run('valle1', 'Valle Uno', 'valle-uno', 'Valle del Cauca');
  insEmpresa.run('antioquia1', 'Antioquia Uno', 'antioquia-uno', 'Antioquia');

  const insContacto = raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, cargo_categoria, email, fuente) VALUES (?, ?, ?, ?, 'seed')`,
  );
  insContacto.run('valle1', 'Ana', 'gerente', 'g@valle1.co');
  insContacto.run('valle1', 'Beto', 'tecnico', 'b@valle1.co');
  // antioquia1 sin contactos
  raw.close();
}
seed();

test('filtra por departamento (columna directa)', () => {
  const soloValle = empresasDeSegmento({
    condiciones: [{ campo: 'departamento', op: 'en', valores: ['Valle del Cauca'] }],
  });
  assert.deepEqual(
    soloValle.map((e) => e.id).sort(),
    ['valle1'],
  );
});

test('filtra por rol via EXISTS: encuentra la empresa con ese contacto', () => {
  const conGerente = empresasDeSegmento({ condiciones: [{ campo: 'rol', op: 'en', valores: ['gerente'] }] });
  assert.deepEqual(conGerente.map((e) => e.id), ['valle1']);
});

test('no_en sobre rol usa NOT EXISTS: excluye la empresa que tiene ese rol', () => {
  const sinGerente = empresasDeSegmento({
    condiciones: [
      { campo: 'departamento', op: 'en', valores: ['Valle del Cauca', 'Antioquia'] },
      { campo: 'rol', op: 'no_en', valores: ['gerente'] },
    ],
  });
  assert.deepEqual(sinGerente.map((e) => e.id), ['antioquia1']);
});

test('personas (COUNT) via mayor_que: solo la empresa con 2 contactos pasa mayor_que 1', () => {
  const dosOmas = empresasDeSegmento({
    condiciones: [
      { campo: 'departamento', op: 'en', valores: ['Valle del Cauca', 'Antioquia'] },
      { campo: 'personas', op: 'mayor_que', valor: 1 },
    ],
  });
  assert.deepEqual(dosOmas.map((e) => e.id), ['valle1']);
});

test('personas con entre 0..0 encuentra la empresa sin contactos', () => {
  const sinContacto = empresasDeSegmento({
    condiciones: [
      { campo: 'departamento', op: 'en', valores: ['Valle del Cauca', 'Antioquia'] },
      { campo: 'personas', op: 'entre', desde: 0, hasta: 0 },
    ],
  });
  assert.deepEqual(sinContacto.map((e) => e.id), ['antioquia1']);
});

test('rol con operador es_null se rechaza explicito (rol solo soporta en/no_en)', () => {
  assert.throws(
    () => empresasDeSegmento({ condiciones: [{ campo: 'rol', op: 'es_null' }] } as any),
    /rol.*en\/no_en/,
  );
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
