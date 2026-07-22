// app/db/repository.widgetsConectados.test.ts
// Tarea 2026-07-22: conecta 4 widgets del cockpit (deals_nuevos, reuniones_agendadas,
// segmentacion_persona) + el borderline (toques_antes_cerrar) contra data real. Los
// calculos puros (calcularFollowUpPorDeal, contarToquesAntesDeFecha) ya tienen su suite
// en core/panel/; esto prueba la parte que SI toca DB real: join/agrupado, EMPRESA_VIVA,
// y el scoping por organizacion/owner -- mismo patron que repository.cockpitCro.test.ts.
//
// Cada test usa su PROPIO idOrganizacion (numeros altos, sin repetir entre tests): estas
// funciones agregan sobre TODA la organizacion, y compartirla entre tests haria que la
// data de uno se sumara al numero del otro (mismo motivo documentado en
// repository.cockpitCro.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  actualizarEstadoNotion,
  dealsNuevosEnRango,
  reunionesAgendadasEnRango,
  segmentacionPorPersona,
  toquesAntesDeCerrarPromedio,
} = await import('./repository.ts');

function seedEmpresa(id: string, estado: string | null, idOrganizacion: number, owner?: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id, owner)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
    )
    .run(id, id, id, estado, idOrganizacion, `ntn-${id}`, owner ?? null);
  raw.close();
}

function seedContacto(idEmpresa: string, cargoCategoria: string | null) {
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO contacto (id_empresa, cargo_categoria, fuente) VALUES (?, ?, 'notion')`)
    .run(idEmpresa, cargoCategoria);
  raw.close();
}

function seedToque(idEmpresa: string, fecha: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO toque (id_empresa, fecha, fuente, id_organizacion) VALUES (?, ?, 'test', 1)`).run(idEmpresa, fecha);
  raw.close();
}

test('dealsNuevosEnRango: cuenta transiciones lead/null -> stage real dentro del rango', () => {
  const ORG = 2001;
  seedEmpresa('dn1', 'lead', ORG); // arranca en lead
  actualizarEstadoNotion('dn1', 'contacto_iniciado', ORG, '2026-05-10'); // lead -> stage real, cuenta

  seedEmpresa('dn2', 'lead', ORG);
  actualizarEstadoNotion('dn2', 'contacto_iniciado', ORG, '2026-05-11'); // cuenta
  actualizarEstadoNotion('dn2', 'reunion_agendada', ORG, '2026-05-12'); // contacto_iniciado -> reunion, NO cuenta (origen no es lead)

  seedEmpresa('dn3', 'lead', ORG);
  actualizarEstadoNotion('dn3', 'contacto_iniciado', ORG, '2026-06-01'); // fuera de rango

  const n = dealsNuevosEnRango(ORG, '2026-05-01', '2026-05-31');
  assert.equal(n, 2);
});

test('dealsNuevosEnRango: filtra por owner cuando se pasa', () => {
  const ORG = 2002;
  seedEmpresa('dno1', 'lead', ORG, 'Felipe Castro');
  actualizarEstadoNotion('dno1', 'contacto_iniciado', ORG, '2026-05-10');

  seedEmpresa('dno2', 'lead', ORG, 'Thomas Schumacher');
  actualizarEstadoNotion('dno2', 'contacto_iniciado', ORG, '2026-05-10');

  assert.equal(dealsNuevosEnRango(ORG, '2026-05-01', '2026-05-31'), 2);
  assert.equal(dealsNuevosEnRango(ORG, '2026-05-01', '2026-05-31', 'Felipe Castro'), 1);
});

test('reunionesAgendadasEnRango: cuenta transiciones a reunion_agendada en el rango', () => {
  const ORG = 2003;
  seedEmpresa('ra1', 'lead', ORG);
  actualizarEstadoNotion('ra1', 'contacto_iniciado', ORG, '2026-05-01');
  actualizarEstadoNotion('ra1', 'reunion_agendada', ORG, '2026-05-10'); // cuenta

  seedEmpresa('ra2', 'lead', ORG);
  actualizarEstadoNotion('ra2', 'contacto_iniciado', ORG, '2026-05-01'); // no es reunion_agendada

  const n = reunionesAgendadasEnRango(ORG, '2026-05-01', '2026-05-31');
  assert.equal(n, 1);
});

test('segmentacionPorPersona: agrupa contactos por cargo_categoria, scoped a organizacion', () => {
  const ORG = 2004;
  const OTRA_ORG = 2005;
  seedEmpresa('sp1', 'oportunidad', ORG);
  seedContacto('sp1', 'dueno');
  seedContacto('sp1', 'gerente');
  seedEmpresa('sp2', 'oportunidad', ORG);
  seedContacto('sp2', 'dueno');
  seedContacto('sp2', null); // cae en sin_categoria

  seedEmpresa('sp3', 'oportunidad', OTRA_ORG); // otra organizacion, no debe contar
  seedContacto('sp3', 'dueno');

  const resultado = segmentacionPorPersona(ORG);
  assert.equal(resultado['dueno'], 2);
  assert.equal(resultado['gerente'], 1);
  assert.equal(resultado['sin_categoria'], 1);
});

test('segmentacionPorPersona: filtra por owner cuando se pasa', () => {
  const ORG = 2006;
  seedEmpresa('spo1', 'oportunidad', ORG, 'Felipe Castro');
  seedContacto('spo1', 'dueno');
  seedEmpresa('spo2', 'oportunidad', ORG, 'Thomas Schumacher');
  seedContacto('spo2', 'gerente');

  const resultado = segmentacionPorPersona(ORG, 'Felipe Castro');
  assert.deepEqual(resultado, { dueno: 1 });
});

test('toquesAntesDeCerrarPromedio: promedia toques ANTES de firma_pago, ignora los posteriores', () => {
  const ORG = 2007;
  seedEmpresa('tc1', 'lead', ORG);
  seedToque('tc1', '2026-05-01');
  seedToque('tc1', '2026-05-05');
  actualizarEstadoNotion('tc1', 'firma_pago', ORG, '2026-05-10'); // 2 toques antes de cerrar
  seedToque('tc1', '2026-05-15'); // despues de cerrar, no cuenta

  seedEmpresa('tc2', 'lead', ORG);
  seedToque('tc2', '2026-06-01');
  actualizarEstadoNotion('tc2', 'firma_pago', ORG, '2026-06-02'); // 1 toque antes de cerrar

  const promedio = toquesAntesDeCerrarPromedio(ORG);
  assert.equal(promedio, 1.5); // (2+1)/2
});

test('toquesAntesDeCerrarPromedio: ninguna empresa cerro -- null, no 0', () => {
  const promedio = toquesAntesDeCerrarPromedio(2099);
  assert.equal(promedio, null);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
