// planear_dia (write) y plan_vs_ejecutado (lectura), 2026-07-26. El plan del dia deja de ser
// un markdown: se escribe, y despues se puede preguntar cuanto de lo planeado se hizo.
//
// Corren contra `toque_planeado`, cuyo DDL propuso experto-followups en
// drizzle/manual/0016_toque_planeado.sql y NO esta aplicado a produccion. La base de prueba lo
// replica en app/db/test-helpers.ts.
//
// Mismo patron que tools.write.test.ts: DB de archivo, ISPS_DB_PATH fijado ANTES del import
// dinamico de tools.ts, siembra y relectura con better-sqlite3 crudo.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { planearDiaTool, planVsEjecutadoTool, registrarToqueTool, aplazarSeguimientoTool } = await import('./tools.ts');

function seedEmpresa(id: string, opts: { owner?: string; proximoFollowUp?: string; idOrganizacion?: number } = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, owner, organizacion_activa_id, proximo_follow_up_fecha)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', ?, ?, ?)`,
    )
    .run(id, id, id, opts.owner ?? 'Sebastian', opts.idOrganizacion ?? 1, opts.proximoFollowUp ?? null);
  raw.close();
}

function filasPlan(fecha: string): any[] {
  const raw = new Database(dbPath);
  const filas = raw.prepare(`SELECT * FROM toque_planeado WHERE fecha_dia = ? ORDER BY id_toque_planeado`).all(fecha);
  raw.close();
  return filas;
}

test('planearDiaTool persiste el plan y devuelve lo que quedo escrito, releido', () => {
  seedEmpresa('p1');
  seedEmpresa('p2');

  const r = planearDiaTool(
    {
      fecha: '2026-08-03',
      cuentas: [
        { idEmpresa: 'p1', tipo: 'seguimiento', origen: 'manual' },
        { idEmpresa: 'p2', tipo: 'cierre', origen: 'manual', nota: 'confirmar la demo' },
      ],
    },
    1,
  );

  // Contra la DB cruda: la garantia es el INSERT.
  const filas = filasPlan('2026-08-03');
  assert.equal(filas.length, 2);
  assert.equal(filas[0].tipo, 'seguimiento');
  assert.equal(filas[1].nota, 'confirmar la demo');
  assert.equal(filas[0].planeado_por, 'Sebastian Acosta Molina');

  assert.equal(r.nuevas, 2);
  assert.equal(r.actualizadas, 0);
  assert.equal(r.plan.length, 2);
  assert.deepEqual(r.rechazadas, []);
});

test('planearDiaTool replanea el mismo dia: corrige la linea, no la duplica', () => {
  seedEmpresa('p3');
  planearDiaTool({ fecha: '2026-08-04', cuentas: [{ idEmpresa: 'p3', tipo: 'seguimiento', origen: 'manual' }] }, 1);
  const r = planearDiaTool({ fecha: '2026-08-04', cuentas: [{ idEmpresa: 'p3', tipo: 'frio', origen: 'rodado' }] }, 1);

  const filas = filasPlan('2026-08-04');
  assert.equal(filas.length, 1, 'replanear no puede dejar dos lineas de la misma cuenta, dia y canal');
  assert.equal(filas[0].tipo, 'frio');
  assert.equal(filas[0].origen, 'rodado');
  assert.equal(r.nuevas, 0);
  assert.equal(r.actualizadas, 1);
});

// Camino de error: una cuenta mal escrita no puede tumbar el plan entero, y tampoco puede
// entrar en silencio.
test('planearDiaTool rechaza y reporta lo que no puede escribir, y escribe el resto', () => {
  seedEmpresa('p4');
  seedEmpresa('p5', { idOrganizacion: 777 });

  const r = planearDiaTool(
    {
      fecha: '2026-08-05',
      cuentas: [
        { idEmpresa: 'p4', tipo: 'seguimiento', origen: 'manual' },
        { idEmpresa: 'no-existe', tipo: 'seguimiento', origen: 'manual' },
        { idEmpresa: 'p5', tipo: 'seguimiento', origen: 'manual' },
        { idEmpresa: 'p4', tipo: 'cierre', origen: 'manual' },
      ],
    },
    1,
  );

  assert.equal(filasPlan('2026-08-05').length, 1);
  assert.deepEqual(r.rechazadas, [
    { idEmpresa: 'no-existe', motivo: 'empresa_no_existe' },
    { idEmpresa: 'p5', motivo: 'otra_organizacion' },
    { idEmpresa: 'p4', motivo: 'duplicada_en_el_input' },
  ]);
});

test('planVsEjecutadoTool separa lo hecho, lo no hecho y lo hecho fuera del plan', () => {
  seedEmpresa('q1');
  seedEmpresa('q2');
  seedEmpresa('q3');

  planearDiaTool(
    {
      fecha: '2026-08-10',
      cuentas: [
        { idEmpresa: 'q1', tipo: 'seguimiento', origen: 'manual' },
        { idEmpresa: 'q2', tipo: 'frio', origen: 'cadencia' },
      ],
    },
    1,
  );
  // q1 se toco (planeada y hecha). q2 no. q3 se toco sin estar en el plan.
  registrarToqueTool({ idEmpresa: 'q1', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-08-10' } as never, 1);
  registrarToqueTool({ idEmpresa: 'q3', canal: 'whatsapp', resultado: 'no_contesto', fecha: '2026-08-10' } as never, 1);

  const r = planVsEjecutadoTool({ desde: '2026-08-10' });

  assert.equal(r.hasta, '2026-08-10', 'sin hasta, el rango es el dia de desde');
  assert.equal(r.total.planeados, 2);
  assert.equal(r.total.ejecutados, 1);
  assert.equal(r.total.noEjecutados, 1);
  assert.equal(r.total.ejecutadosFueraDelPlan, 1);
  assert.equal(r.sinPlanEnElRango, false);
  assert.equal(r.ejecutados[0].idEmpresa, 'q1');
  assert.equal(r.ejecutados[0].cruce, 'empresa_dia');
  assert.equal(r.ejecutados[0].coincideCanal, null, 'el plan no fijo canal: no hay decision que comparar');
  assert.equal(r.noEjecutados[0].idEmpresa, 'q2');
  assert.equal(r.noEjecutados[0].tipo, 'frio');
  assert.equal(r.fueraDelPlan[0].idEmpresa, 'q3');
});

test('plan_vs_ejecutado saca el motivo de lo no hecho del aplazo de esa cuenta ese dia', () => {
  seedEmpresa('q4', { proximoFollowUp: '2026-08-11' });
  planearDiaTool({ fecha: '2026-08-11', cuentas: [{ idEmpresa: 'q4', tipo: 'seguimiento', origen: 'manual' }] }, 1);
  aplazarSeguimientoTool({ idEmpresa: 'q4', fechaNueva: '2026-08-14', motivo: 'plan_irreal' }, 1);

  const r = planVsEjecutadoTool({ desde: '2026-08-11' });
  assert.equal(r.noEjecutados[0].motivo, 'plan_irreal');
  assert.equal(r.noEjecutados[0].motivoFuente, 'aplazo');
  assert.equal(r.noEjecutados[0].aplazadoA, '2026-08-14');
});

test('plan_vs_ejecutado deja el motivo en null cuando nadie lo dijo, sin inferirlo', () => {
  seedEmpresa('q5');
  planearDiaTool({ fecha: '2026-08-12', cuentas: [{ idEmpresa: 'q5', tipo: 'seguimiento', origen: 'manual' }] }, 1);

  const r = planVsEjecutadoTool({ desde: '2026-08-12' });
  assert.equal(r.noEjecutados[0].motivo, null);
  assert.equal(r.noEjecutados[0].motivoFuente, null);
  assert.equal(r.noEjecutados[0].aplazadoA, null);
});

// Se planeo llamada y se mando WhatsApp: el toque se hizo. Se reporta la diferencia, no se
// castiga -- cambiar de canal sobre la marcha es una decision, no un incumplimiento.
test('plan_vs_ejecutado cuenta como ejecutado un toque por otro canal y lo reporta', () => {
  seedEmpresa('q6');
  planearDiaTool(
    { fecha: '2026-08-13', cuentas: [{ idEmpresa: 'q6', tipo: 'seguimiento', origen: 'manual', canal: 'llamada' }] },
    1,
  );
  registrarToqueTool({ idEmpresa: 'q6', canal: 'whatsapp', resultado: 'no_contesto', fecha: '2026-08-13' } as never, 1);

  const r = planVsEjecutadoTool({ desde: '2026-08-13' });
  assert.equal(r.total.ejecutados, 1);
  assert.equal(r.ejecutados[0].canalPlaneado, 'llamada');
  assert.equal(r.ejecutados[0].canalEjecutado, 'whatsapp');
  assert.equal(r.ejecutados[0].coincideCanal, false);
});

// Dos lineas para la misma cuenta el mismo dia, una por canal: la llave del plan es (dia,
// empresa, canal), no (dia, empresa).
test('planearDiaTool admite dos canales para la misma cuenta el mismo dia', () => {
  seedEmpresa('q7');
  const r = planearDiaTool(
    {
      fecha: '2026-08-15',
      cuentas: [
        { idEmpresa: 'q7', tipo: 'seguimiento', origen: 'manual', canal: 'llamada' },
        { idEmpresa: 'q7', tipo: 'seguimiento', origen: 'manual', canal: 'correo' },
      ],
    },
    1,
  );
  assert.equal(r.nuevas, 2);
  assert.deepEqual(r.rechazadas, []);
  assert.equal(filasPlan('2026-08-15').length, 2);
});

// El enlace explicito manda sobre el cruce por empresa y dia: es el unico que distingue cual de
// las dos lineas planeadas se cumplio.
test('plan_vs_ejecutado usa el enlace explicito cuando la fila del plan lo tiene', () => {
  seedEmpresa('q8');
  planearDiaTool(
    {
      fecha: '2026-08-16',
      cuentas: [
        { idEmpresa: 'q8', tipo: 'seguimiento', origen: 'manual', canal: 'llamada' },
        { idEmpresa: 'q8', tipo: 'seguimiento', origen: 'manual', canal: 'correo' },
      ],
    },
    1,
  );
  const { toque } = registrarToqueTool(
    { idEmpresa: 'q8', canal: 'correo', resultado: 'no_contesto', fecha: '2026-08-16' } as never,
    1,
  );
  // El enlace lo escribe quien materialice el plan; hoy ninguna accion del MCP lo hace, asi que
  // aca se pone a mano para probar el camino de lectura.
  const raw = new Database(dbPath);
  raw
    .prepare(`UPDATE toque_planeado SET id_toque = ? WHERE fecha_dia = '2026-08-16' AND canal = 'correo'`)
    .run(toque.idToque);
  raw.close();

  const r = planVsEjecutadoTool({ desde: '2026-08-16' });
  assert.equal(r.total.ejecutados, 1);
  assert.equal(r.total.noEjecutados, 1);
  const hecha = r.ejecutados[0];
  assert.equal(hecha.canalPlaneado, 'correo', 'el enlace decide cual de las dos lineas se cumplio');
  assert.equal(hecha.cruce, 'enlace');
  assert.equal(r.noEjecutados[0].canalPlaneado, 'llamada');
});

// El motivo escrito EN la fila del plan es la fuente primaria; el aplazo es el respaldo. Se dice
// de cual de los dos salio.
test('plan_vs_ejecutado prefiere el motivo de la fila del plan y dice de donde salio', () => {
  seedEmpresa('q9', { proximoFollowUp: '2026-08-17' });
  planearDiaTool({ fecha: '2026-08-17', cuentas: [{ idEmpresa: 'q9', tipo: 'seguimiento', origen: 'manual' }] }, 1);
  aplazarSeguimientoTool({ idEmpresa: 'q9', fechaNueva: '2026-08-20', motivo: 'dia_atravesado' }, 1);
  const raw = new Database(dbPath);
  raw
    .prepare(`UPDATE toque_planeado SET motivo_no_ejecutado = 'cuenta_evitada' WHERE fecha_dia = '2026-08-17'`)
    .run();
  raw.close();

  const r = planVsEjecutadoTool({ desde: '2026-08-17' });
  assert.equal(r.noEjecutados[0].motivo, 'cuenta_evitada');
  assert.equal(r.noEjecutados[0].motivoFuente, 'plan');
  assert.equal(r.noEjecutados[0].aplazadoA, '2026-08-20');
});

test('plan_vs_ejecutado corta por dia dentro de un rango', () => {
  seedEmpresa('r1');
  seedEmpresa('r2');
  planearDiaTool({ fecha: '2026-09-01', cuentas: [{ idEmpresa: 'r1', tipo: 'seguimiento', origen: 'manual' }] }, 1);
  planearDiaTool({ fecha: '2026-09-02', cuentas: [{ idEmpresa: 'r2', tipo: 'seguimiento', origen: 'manual' }] }, 1);
  registrarToqueTool({ idEmpresa: 'r2', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-09-02' } as never, 1);

  const r = planVsEjecutadoTool({ desde: '2026-09-01', hasta: '2026-09-02' });
  assert.deepEqual(r.porDia, [
    { fecha: '2026-09-01', planeados: 1, ejecutados: 0, noEjecutados: 1, ejecutadosFueraDelPlan: 0 },
    { fecha: '2026-09-02', planeados: 1, ejecutados: 1, noEjecutados: 0, ejecutadosFueraDelPlan: 0 },
  ]);
});

// La distincion que evita leer un dia sin plan como un incumplimiento del 100%.
test('plan_vs_ejecutado distingue "planeo cero" de "nadie escribio el plan"', () => {
  seedEmpresa('r3');
  registrarToqueTool({ idEmpresa: 'r3', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-09-20' } as never, 1);

  const r = planVsEjecutadoTool({ desde: '2026-09-20' });
  assert.equal(r.sinPlanEnElRango, true);
  assert.equal(r.total.planeados, 0);
  assert.equal(r.total.ejecutadosFueraDelPlan, 1);
});

test('plan_vs_ejecutado filtra por owner y no mezcla carteras', () => {
  seedEmpresa('s1', { owner: 'Felipe Castro' });
  seedEmpresa('s2', { owner: 'Sebastian' });
  planearDiaTool(
    {
      fecha: '2026-09-25',
      cuentas: [
        { idEmpresa: 's1', tipo: 'seguimiento', origen: 'manual' },
        { idEmpresa: 's2', tipo: 'seguimiento', origen: 'manual' },
      ],
    },
    1,
  );

  const r = planVsEjecutadoTool({ desde: '2026-09-25', owner: 'Felipe Castro' });
  assert.equal(r.total.planeados, 1);
  assert.equal(r.noEjecutados[0].idEmpresa, 's1');
});

test.after(() => borrarDbPrueba(dbPath));
