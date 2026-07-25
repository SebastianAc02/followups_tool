// Pruebas de las dos tools de LECTURA nuevas: actividad (que se hizo y que no se hizo en un
// periodo) y cola (que vence hoy y que esta vencido). Mismo patron que tools.cuentas.test.ts:
// una sola DB de archivo para todo el modulo, INSERT crudo con better-sqlite3, ids/organizaciones
// unicas por test para no pisarse entre corridas dentro del mismo archivo.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actividadTool, colaTool } = await import('./tools.ts');

test.after(() => borrarDbPrueba(dbPath));

function seedEmpresa(
  id: string,
  idOrganizacion: number,
  opts: {
    nombre?: string;
    estado?: string | null;
    owner?: string | null;
    proximoFollowUpFecha?: string | null;
    proximoPaso?: string | null;
  } = {},
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id, owner, proximo_follow_up_fecha, proximo_paso)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      opts.nombre ?? `Empresa ${id}`,
      id,
      opts.estado ?? null,
      idOrganizacion,
      opts.owner ?? null,
      opts.proximoFollowUpFecha ?? null,
      opts.proximoPaso ?? null,
    );
  raw.close();
}

function seedToque(
  idEmpresa: string,
  fecha: string,
  idOrganizacion: number,
  opts: { canal?: string; resultado?: string; ejecutadoPor?: string | null } = {},
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO toque (id_empresa, fecha, canal, resultado, fuente, ejecutado_por, id_organizacion)
       VALUES (?, ?, ?, ?, 'herramienta', ?, ?)`,
    )
    .run(idEmpresa, fecha, opts.canal ?? 'llamada', opts.resultado ?? 'contesto_sigue_seguimiento', opts.ejecutadoPor ?? null, idOrganizacion);
  raw.close();
}

function seedAplazo(
  idEmpresa: string,
  fechaIncumplida: string,
  idOrganizacion: number,
  opts: { fechaNueva?: string; aplazadoPor?: string | null; motivo?: string | null; nota?: string | null } = {},
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO seguimiento_aplazado (id_empresa, fecha_incumplida, fecha_nueva, motivo, nota, aplazado_por, id_organizacion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      idEmpresa,
      fechaIncumplida,
      opts.fechaNueva ?? '2026-08-01',
      opts.motivo ?? null,
      opts.nota ?? null,
      opts.aplazadoPor ?? null,
      idOrganizacion,
    );
  raw.close();
}

// --- actividadTool ---------------------------------------------------------------------

test('actividad: rango inclusivo en los dos bordes, con nombre y estado de la empresa cruzados', () => {
  const ORG = 9001;
  seedEmpresa('a1', ORG, { nombre: 'Empresa A1', estado: 'oportunidad' });
  // Un dia antes de "desde": tiene que quedar fuera.
  seedToque('a1', '2026-07-09', ORG);
  // Exactamente en "desde": borde inferior inclusivo.
  seedToque('a1', '2026-07-10', ORG);
  // Exactamente en "hasta": borde superior inclusivo.
  seedToque('a1', '2026-07-15', ORG);
  // Un dia despues de "hasta": tiene que quedar fuera.
  seedToque('a1', '2026-07-16', ORG);

  const r = actividadTool({ desde: '2026-07-10', hasta: '2026-07-15', idOrganizacion: ORG });

  assert.equal(r.totalToques, 2, 'solo los dos toques dentro del rango, los de los bordes exactos');
  assert.ok(r.toques.every((t) => t.fecha === '2026-07-10' || t.fecha === '2026-07-15'));
  // El cruce con empresa: nombre_oficial y estado_notion de la empresa, no de toque (toque no
  // guarda ninguno de los dos).
  const cualquiera = r.toques[0];
  assert.equal(cualquiera.empresa, 'Empresa A1');
  assert.equal(cualquiera.estado, 'oportunidad');
});

test('actividad: los aplazos van en su propia lista y no se suman a totalToques', () => {
  const ORG = 9002;
  seedEmpresa('a2', ORG, { nombre: 'Empresa A2', estado: 'contacto_iniciado' });
  seedToque('a2', '2026-07-10', ORG);
  seedAplazo('a2', '2026-07-11', ORG, { motivo: 'cuenta_evitada', nota: 'la vengo dejando de ultima' });

  const r = actividadTool({ desde: '2026-07-01', hasta: '2026-07-31', idOrganizacion: ORG });

  assert.equal(r.totalToques, 1, 'el aplazo no cuenta como toque');
  assert.equal(r.totalAplazos, 1);
  assert.equal(r.aplazos.length, 1);
  // El aplazo no debe aparecer mezclado en el arreglo de toques.
  assert.ok(!r.toques.some((t) => (t as any).fechaIncumplida));
  assert.equal(r.aplazos[0].idEmpresa, 'a2');
  // El motivo acotado y la nota en prosa salen los dos, separados: el primero es el que se
  // puede agrupar, el segundo es contexto para un humano.
  assert.equal(r.aplazos[0].motivo, 'cuenta_evitada');
  assert.equal(r.aplazos[0].nota, 'la vengo dejando de ultima');
});

test('actividad: ejecutadoPor filtra por el ejecutor real; un toque sin atribuir (NULL) nunca matchea', () => {
  const ORG = 9003;
  seedEmpresa('a3', ORG, { nombre: 'Empresa A3' });
  seedToque('a3', '2026-07-10', ORG, { ejecutadoPor: 'Felipe Castro' });
  // Toque sin atribucion: ejecutado_por NULL, no se le adjudica a nadie por descarte.
  seedToque('a3', '2026-07-11', ORG, { ejecutadoPor: null });

  const filtrado = actividadTool({ desde: '2026-07-01', hasta: '2026-07-31', ejecutadoPor: 'Felipe Castro', idOrganizacion: ORG });
  assert.equal(filtrado.totalToques, 1, 'solo el toque atribuido a Felipe Castro');
  assert.ok(filtrado.toques.every((t) => t.ejecutadoPor === 'Felipe Castro'));

  // Sin filtro, toquesSinAtribuir cuenta los NULL: aca es 1 (el que quedo sin ejecutado_por).
  const sinFiltro = actividadTool({ desde: '2026-07-01', hasta: '2026-07-31', idOrganizacion: ORG });
  assert.equal(sinFiltro.totalToques, 2);
  assert.equal(sinFiltro.toquesSinAtribuir, 1);
});

test('actividad: owner (de la empresa) filtra toques Y aplazos', () => {
  const ORG = 9004;
  seedEmpresa('a4-fc', ORG, { nombre: 'Empresa A4 FC', owner: 'Felipe Castro' });
  seedEmpresa('a4-cf', ORG, { nombre: 'Empresa A4 CF', owner: 'Camilo Fonseca' });
  seedToque('a4-fc', '2026-07-10', ORG);
  seedToque('a4-cf', '2026-07-10', ORG);
  seedAplazo('a4-fc', '2026-07-10', ORG);
  seedAplazo('a4-cf', '2026-07-10', ORG);

  const r = actividadTool({ desde: '2026-07-01', hasta: '2026-07-31', owner: 'Felipe Castro', idOrganizacion: ORG });

  assert.equal(r.totalToques, 1);
  assert.equal(r.toques[0].idEmpresa, 'a4-fc');
  assert.equal(r.totalAplazos, 1, 'el owner tambien recorta los aplazos, no solo los toques');
  assert.equal(r.aplazos[0].idEmpresa, 'a4-fc');
});

test('actividad: respeta idOrganizacion, un toque de otra organizacion no aparece', () => {
  const ORG = 9005;
  const OTRA_ORG = 9006;
  seedEmpresa('a5', ORG, { nombre: 'Empresa A5' });
  seedToque('a5', '2026-07-10', ORG);
  // Mismo id_empresa, pero el toque queda escrito bajo otra organizacion.
  seedToque('a5', '2026-07-10', OTRA_ORG);

  const r = actividadTool({ desde: '2026-07-01', hasta: '2026-07-31', idOrganizacion: ORG });
  assert.equal(r.totalToques, 1, 'el toque de OTRA_ORG no debe colarse');
});

// --- colaTool ----------------------------------------------------------------------------

test('cola: separa vencidos de lo que vence hoy y calcula diasAtraso correcto', () => {
  const ORG = 9101;
  const CORTE = '2026-07-20';
  // 2 dias de atraso contra el corte.
  seedEmpresa('c1', ORG, { estado: 'oportunidad', proximoFollowUpFecha: '2026-07-18' });
  // Vence exactamente hoy: diasAtraso tiene que ser 0, no negativo ni positivo.
  seedEmpresa('c2', ORG, { estado: 'oportunidad', proximoFollowUpFecha: CORTE });

  const r = colaTool({ fecha: CORTE, idOrganizacion: ORG });

  assert.equal(r.totalVencidos, 1);
  assert.equal(r.totalVenceHoy, 1);
  const vencido = r.vencidos.find((f) => f.idEmpresa === 'c1');
  assert.ok(vencido);
  assert.equal(vencido!.diasAtraso, 2);
  const hoyMismo = r.venceHoy.find((f) => f.idEmpresa === 'c2');
  assert.ok(hoyMismo);
  assert.equal(hoyMismo!.diasAtraso, 0, 'lo que vence hoy no es atraso, diasAtraso tiene que quedar en 0');
});

test('cola: excluye on_hold, firma_pago y lead, y filtra por owner', () => {
  const ORG = 9102;
  const CORTE = '2026-07-20';
  const VENCIDA = '2026-07-15';
  seedEmpresa('c3-onhold', ORG, { estado: 'on_hold', owner: 'Camilo Fonseca', proximoFollowUpFecha: VENCIDA });
  seedEmpresa('c3-firma', ORG, { estado: 'firma_pago', owner: 'Camilo Fonseca', proximoFollowUpFecha: VENCIDA });
  seedEmpresa('c3-lead', ORG, { estado: 'lead', owner: 'Camilo Fonseca', proximoFollowUpFecha: VENCIDA });
  // Misma condicion de fecha y estado valido, pero owner distinto: el filtro de owner
  // tiene que dejarla fuera aunque cumpla todo lo demas.
  seedEmpresa('c3-otro-owner', ORG, { estado: 'oportunidad', owner: 'Felipe Castro', proximoFollowUpFecha: VENCIDA });
  seedEmpresa('c3-si', ORG, { estado: 'oportunidad', owner: 'Camilo Fonseca', proximoFollowUpFecha: VENCIDA });

  const r = colaTool({ fecha: CORTE, owner: 'Camilo Fonseca', idOrganizacion: ORG });

  const ids = [...r.vencidos, ...r.venceHoy].map((f) => f.idEmpresa);
  assert.deepEqual(ids, ['c3-si']);
});
