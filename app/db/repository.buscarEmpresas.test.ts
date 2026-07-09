// V3.9: buscarEmpresasPorNombre no debe interferir con colaDelDia/contadoresHoy --
// es una busqueda aparte, sin filtro de owner ni de proximoFollowUpFecha.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { buscarEmpresasPorNombre, colaDelDia, contadoresHoy } = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, es_cliente, owner)
       VALUES ('cli-1', 'nit', 'Cliente Existente SAS', 'cliente existente sas', 'cliente', 1, NULL)`,
    )
    .run();
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner)
       VALUES ('lead-1', 'nit', 'Lead Normal SAS', 'lead normal sas', 'lead', 'Sebastian Acosta Molina')`,
    )
    .run();
  raw.close();
}

seed();

test('buscarEmpresasPorNombre encuentra un cliente sin owner ni follow-up (fuera de la cola)', () => {
  const resultados = buscarEmpresasPorNombre('Cliente Existente');
  assert.strictEqual(resultados.length, 1);
  assert.strictEqual(resultados[0].id, 'cli-1');
  assert.strictEqual(resultados[0].esCliente, 1);
});

test('buscarEmpresasPorNombre es case-insensitive', () => {
  assert.strictEqual(buscarEmpresasPorNombre('cliente existente').length, 1);
});

test('el cliente buscado NO aparece en colaDelDia ni afecta contadoresHoy de nadie', () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const colaSebastian = colaDelDia(hoy, 'Sebastian Acosta Molina', 1);
  assert.ok(!colaSebastian.some((c) => c.id === 'cli-1'));

  const contadores = contadoresHoy(hoy, 'Sebastian Acosta Molina', 1);
  assert.strictEqual(contadores.total, 0);
});

test('colaDelDia no muestra un lead de otra organizacion aunque el owner coincida', () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES ('emp-otra-org', 'nit', 'De Otra Organizacion', 'de otra organizacion', 'lead', 'Sebastian Acosta Molina', ?, 2)`,
    )
    .run(hoy);
  raw.close();

  const colaOrg1 = colaDelDia(hoy, 'Sebastian Acosta Molina', 1);
  assert.ok(!colaOrg1.some((c) => c.id === 'emp-otra-org'), 'un lead de organizacion 2 no debe aparecer en la cola de organizacion 1');

  const colaOrg2 = colaDelDia(hoy, 'Sebastian Acosta Molina', 2);
  assert.ok(colaOrg2.some((c) => c.id === 'emp-otra-org'), 'el mismo lead SI debe verse desde su propia organizacion');
});

test.after(() => borrarDbPrueba(dbPath));
