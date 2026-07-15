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

// Task 5 (plan 2026-07-15-embudo-real-y-registro): el test anterior aca ("embudoPipeline
// solo cuenta las empresas atacables") codificaba el criterio EQUIVOCADO -- confundio
// "no es mi target de prospeccion" (atacable, ver memoria atacable-es-prospeccion) con
// "no existe como negocio". Ese filtro tumbaba 15 de las 22 oportunidades reales de
// Thomas (AFINIA, ENEL, CLARO, TIGO, WOM, ETB, DIRECTV, acueductos). El sintoma real
// ("46M de usuarios en Oportunidad") era sumar suscriptores electricos sin cortar por
// categoria (Task 6), no un problema de contar empresas de mas.
test('embudoPipeline cuenta carriers y utilities como deals reales, no solo ISPs', () => {
  seedEmpresa('e-isp-embudo', 'ISP Real', 'isp');
  seedEmpresa('e-carrier-embudo', 'CLARO', 'isp');
  seedClasificacion('e-carrier-embudo', { es_no_isp_confirmado: 1 });
  seedEmpresa('e-utility-embudo', 'ENEL', 'isp');
  seedClasificacion('e-utility-embudo', { es_utility_no_isp: 1 });

  const raw = new Database(dbPath);
  raw
    .prepare(
      // notion_page_id: las 3 necesitan pasar el predicado EN_PIPELINE (Task 7) para que
      // este test aisle solo lo que prueba (categoria), sin que el filtro de trabajo real
      // las tumbe por otra razon.
      "UPDATE empresa SET estado_notion='oportunidad', notion_page_id='ntn-'||id_empresa WHERE id_empresa IN ('e-isp-embudo','e-carrier-embudo','e-utility-embudo')",
    )
    .run();
  raw.close();

  const oportunidad = embudoPipeline(1).find((f) => f.estado === 'oportunidad');
  assert.ok(oportunidad);
  assert.equal(oportunidad!.total, 3, 'el carrier (CLARO) y la utility (ENEL) siguen siendo deals reales, no se descartan');
});

// Task 7: una empresa con estado de pipeline pero CERO toques y sin notion_page_id (el
// caso de las 44 del seed del 30-jun, ver planning/revision-44-fuera-de-notion.txt) no es
// trabajo real y debe desaparecer del embudo, aunque siga viva en la base.
test('embudoPipeline no cuenta una empresa sin toques y sin notion_page_id (EN_PIPELINE)', () => {
  seedEmpresa('e-fantasma', 'Fantasma Seed SAS', 'isp');
  const raw = new Database(dbPath);
  raw.prepare("UPDATE empresa SET estado_notion='contacto_iniciado' WHERE id_empresa='e-fantasma'").run();
  raw.close();

  const contactoIniciado = embudoPipeline(1).find((f) => f.estado === 'contacto_iniciado');
  assert.equal(contactoIniciado, undefined, 'sin notion_page_id ni toques, no debe aparecer en el embudo');
});

test('embudoPipeline SI cuenta una empresa con notion_page_id aunque no tenga toques', () => {
  seedEmpresa('e-con-pagina', 'Con Pagina SAS', 'isp');
  const raw = new Database(dbPath);
  raw
    .prepare("UPDATE empresa SET estado_notion='lead', notion_page_id='ntn-123' WHERE id_empresa='e-con-pagina'")
    .run();
  raw.close();

  const lead = embudoPipeline(1).find((f) => f.estado === 'lead');
  assert.ok(lead && lead.total >= 1, 'con pagina de Notion cuenta como trabajo real');
});

// Task 6: los usuarios se suman POR categoria, nunca en un total unico (asi ENEL no
// infla el numero de ISP -- el sintoma original de "46M usuarios en Oportunidad").
test('embudoPipeline reporta porCategoria (isp/esp) con usuarios separados', () => {
  seedEmpresa('e-isp-cat', 'ISP Cat', 'isp');
  seedEmpresa('e-esp-cat', 'ENEL Cat', 'isp');
  seedClasificacion('e-esp-cat', { es_utility_no_isp: 1 });

  const raw = new Database(dbPath);
  raw
    .prepare(
      "UPDATE empresa SET estado_notion='lead', notion_page_id='ntn-'||id_empresa WHERE id_empresa IN ('e-isp-cat','e-esp-cat')",
    )
    .run();
  raw.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_efectivos) VALUES ('e-isp-cat', 100, 100)`).run();
  raw.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_efectivos) VALUES ('e-esp-cat', 5000000, 5000000)`).run();
  raw.close();

  const lead = embudoPipeline(1).find((f) => f.estado === 'lead');
  assert.ok(lead?.porCategoria);
  assert.equal(lead!.porCategoria!.isp.usuarios, 100, 'los usuarios ISP no deben incluir los de ENEL');
  assert.equal(lead!.porCategoria!.esp.usuarios, 5000000);
});

// Task 15: en_notion deja segmentar leads que nunca entraron al CRM (causa raiz 1 del
// plan). es_null (fuera de Notion) / no_null (en Notion) sobre empresa.notion_page_id.
test('empresasDeSegmento: en_notion filtra por notion_page_id null / no null', () => {
  seedEmpresa('e-en-notion', 'Con Pagina Segmento', 'isp');
  seedEmpresa('e-fuera-notion', 'Sin Pagina Segmento', 'isp');
  const raw = new Database(dbPath);
  raw.prepare("UPDATE empresa SET notion_page_id='ntn-e-en-notion' WHERE id_empresa='e-en-notion'").run();
  raw.close();

  const enNotion = empresasDeSegmento({ condiciones: [{ campo: 'en_notion', op: 'no_null' }] }, 1).map((e) => e.id);
  assert.ok(enNotion.includes('e-en-notion'));
  assert.ok(!enNotion.includes('e-fuera-notion'));

  const fueraDeNotion = empresasDeSegmento({ condiciones: [{ campo: 'en_notion', op: 'es_null' }] }, 1).map((e) => e.id);
  assert.ok(fueraDeNotion.includes('e-fuera-notion'));
  assert.ok(!fueraDeNotion.includes('e-en-notion'));
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
