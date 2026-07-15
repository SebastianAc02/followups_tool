// T8: la app lee categoria de la VISTA empresa_categoria (derivada de
// empresa_clasificacion), no de la columna plana empresa.categoria (stale, ver spec
// Fase 2 "categoria el no gana"). Este test prueba el caso que motiva la tarea: un
// carrier (VERIZON) con empresa.categoria='isp' (dato viejo) pero con un veto real
// de clasificacion (es_carrier=1) ya no debe salir como isp en segmentos ni en el
// dropdown de valores distintos.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { empresasDeSegmento, valoresDistintosCampo, getCuenta, embudoPipeline } = await import('./repository.ts');

function seedEmpresa(id: string, nombreOficial: string, categoriaPlana: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?, 1)`,
    )
    .run(id, nombreOficial, nombreOficial.toLowerCase(), categoriaPlana);
  raw.close();
}

function seedClasificacion(idEmpresa: string, columnas: Record<string, number>) {
  const raw = new Database(dbPath);
  const cols = Object.keys(columnas);
  const placeholders = cols.map(() => '?').join(', ');
  raw
    .prepare(`INSERT INTO empresa_clasificacion (id_empresa, ${cols.join(', ')}) VALUES (?, ${placeholders})`)
    .run(idEmpresa, ...cols.map((c) => columnas[c]));
  raw.close();
}

// VERIZON: la columna plana (dato viejo, nunca reclasificado) todavia dice 'isp',
// pero es un carrier real (es_carrier=1 en empresa_clasificacion).
seedEmpresa('verizon-1', 'VERIZON', 'isp');
seedClasificacion('verizon-1', { es_carrier: 1 });

// ISP de verdad, sin fila de clasificacion (el LEFT JOIN cae a 'isp' por default).
seedEmpresa('isp-real-1', 'ISP Real SAS', 'isp');

test('un segmento que filtra categoria=isp NO trae a VERIZON (es carrier en la vista, no isp)', () => {
  const def = { condiciones: [{ campo: 'categoria' as const, op: 'en' as const, valores: ['isp'] }] };
  const ids = empresasDeSegmento(def, 1).map((e) => e.id);
  assert.ok(!ids.includes('verizon-1'), 'VERIZON no deberia salir como isp');
  assert.ok(ids.includes('isp-real-1'), 'el isp real si debe seguir saliendo');
});

test('un segmento que filtra categoria=carrier SI trae a VERIZON', () => {
  const def = { condiciones: [{ campo: 'categoria' as const, op: 'en' as const, valores: ['carrier'] }] };
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id), ['verizon-1']);
});

test('valoresDistintosCampo(categoria) devuelve carrier para VERIZON, no isp', () => {
  const valores = valoresDistintosCampo('categoria', 1);
  assert.ok(valores.includes('carrier'), `esperaba 'carrier' entre los valores, llego [${valores.join(', ')}]`);
});

test('getCuenta trae la categoria de la vista (carrier), no la columna plana (isp)', () => {
  const { emp } = getCuenta('verizon-1', 1);
  assert.equal(emp?.categoria, 'carrier');
});

// D (2026-07-15): el embudo de /pipeline contaba TODA empresa con estado, sin mirar la
// categoria real. Claro, Tigo, WOM (no_isp), los acueductos y las energeticas (utility)
// entraban al embudo comercial y metian sus millones de suscriptores al total de
// usuarios. La categoria real vive en la vista empresa_categoria (une los vetos de
// empresa_clasificacion), no en la columna cruda empresa.categoria.
test('embudoPipeline solo cuenta las empresas atacables (isp), no carriers ni utilities', () => {
  seedEmpresa('e-isp-embudo', 'ISP Real', 'isp');
  seedEmpresa('e-carrier-embudo', 'CLARO', 'isp');
  seedClasificacion('e-carrier-embudo', { es_no_isp_confirmado: 1 });
  seedEmpresa('e-utility-embudo', 'ENEL', 'isp');
  seedClasificacion('e-utility-embudo', { es_utility_no_isp: 1 });

  const raw = new Database(dbPath);
  raw
    .prepare(
      "UPDATE empresa SET estado_notion='oportunidad' WHERE id_empresa IN ('e-isp-embudo','e-carrier-embudo','e-utility-embudo')",
    )
    .run();
  raw.close();

  const oportunidad = embudoPipeline(1).find((f) => f.estado === 'oportunidad');
  assert.ok(oportunidad);
  assert.equal(oportunidad!.total, 1, 'solo el ISP real; el carrier y la utility quedan fuera');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
