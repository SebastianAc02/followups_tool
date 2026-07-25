// aplazar_seguimiento (write nueva, 2026-07-25) + toque.ejecutado_por (columna nueva).
// Mismo patron que tools.write.test.ts: DB de archivo, ISPS_DB_PATH fijado ANTES del import
// dinamico de tools.ts, siembra y relectura con better-sqlite3 crudo.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { aplazarSeguimientoTool, registrarToqueTool, cambiarCadenciaTool } = await import('./tools.ts');
const { outboxPendientes } = await import('../db/repository.ts');

function seedEmpresa(
  id: string,
  proximoFollowUpFecha: string | null,
  notionPageId: string | null = null,
  idOrganizacion = 1,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id, proximo_follow_up_fecha)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', ?, ?, ?)`,
    )
    .run(id, id, id, idOrganizacion, notionPageId, proximoFollowUpFecha);
  raw.close();
}

function contarToques(id: string): number {
  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT count(*) AS n FROM toque WHERE id_empresa = ?`).get(id) as any;
  raw.close();
  return fila.n;
}

function contarAplazos(id: string): number {
  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT count(*) AS n FROM seguimiento_aplazado WHERE id_empresa = ?`).get(id) as any;
  raw.close();
  return fila.n;
}

test('aplazarSeguimientoTool mueve la fecha y guarda la incumplida en seguimiento_aplazado', () => {
  seedEmpresa('a1', '2026-08-01');
  aplazarSeguimientoTool(
    { idEmpresa: 'a1', fechaNueva: '2026-08-10', motivo: 'dia_atravesado', nota: 'se alargo la reunion de las 3' },
    1,
  );

  // Verificacion contra la DB cruda, no contra el valor de retorno: es la garantia real de
  // que el UPDATE de empresa y el INSERT de seguimiento_aplazado quedaron escritos.
  const raw = new Database(dbPath);
  const emp = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'a1'`).get() as any;
  const fila = raw
    .prepare(`SELECT fecha_incumplida, fecha_nueva, motivo, nota FROM seguimiento_aplazado WHERE id_empresa = 'a1'`)
    .get() as any;
  raw.close();

  assert.equal(emp.proximo_follow_up_fecha, '2026-08-10');
  assert.equal(fila.fecha_incumplida, '2026-08-01');
  assert.equal(fila.fecha_nueva, '2026-08-10');
  // El motivo es uno de los cuatro valores cerrados; la prosa vive aparte y no lo reemplaza.
  assert.equal(fila.motivo, 'dia_atravesado');
  assert.equal(fila.nota, 'se alargo la reunion de las 3');
});

// El motivo acotado es la razon de ser de la columna: si aceptara prosa, "no me dio el dia" y
// "se atraveso la U" serian dos motivos distintos y no se podria contar nada.
test('un motivo fuera de los cuatro valores cerrados se rechaza y no escribe nada', () => {
  seedEmpresa('a10', '2026-08-01');
  assert.throws(() => aplazarSeguimientoTool({ idEmpresa: 'a10', fechaNueva: '2026-08-05', motivo: 'no contesto' } as any, 1));

  const raw = new Database(dbPath);
  const emp = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'a10'`).get() as any;
  raw.close();
  // Zod lanza antes de la transaccion: ni el aplazo ni el movimiento de fecha quedan.
  assert.equal(contarAplazos('a10'), 0);
  assert.equal(emp.proximo_follow_up_fecha, '2026-08-01');
});

test('los cuatro motivos validos se aceptan tal cual', () => {
  const motivos = ['plan_irreal', 'dia_atravesado', 'tiempo_no_usado', 'cuenta_evitada'] as const;
  seedEmpresa('a11', '2026-08-01');
  motivos.forEach((motivo, i) => {
    aplazarSeguimientoTool({ idEmpresa: 'a11', fechaNueva: `2026-09-0${i + 1}`, motivo }, 1);
  });

  const raw = new Database(dbPath);
  const filas = raw
    .prepare(`SELECT motivo FROM seguimiento_aplazado WHERE id_empresa = 'a11' ORDER BY id ASC`)
    .all() as any[];
  raw.close();
  assert.deepEqual(filas.map((f) => f.motivo), [...motivos]);
});

// NULL significa "no lo dijo", y es distinto de cualquiera de los cuatro motivos. Rellenarlo
// con un default convertiria un dato que no existe en una causa inventada.
test('sin motivo la columna queda en NULL; el ejecutor SI tiene default', () => {
  seedEmpresa('a12', '2026-08-01');
  aplazarSeguimientoTool({ idEmpresa: 'a12', fechaNueva: '2026-08-05' }, 1);

  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT motivo, nota, aplazado_por FROM seguimiento_aplazado WHERE id_empresa = 'a12'`).get() as any;
  raw.close();
  // motivo y nota siguen sin default: por que no se hizo lo dice el operador o no se sabe, y
  // eso no se infiere nunca desde la fecha, el owner ni la cuenta.
  assert.equal(fila.motivo, null);
  assert.equal(fila.nota, null);
  // aplazadoPor SI, desde el 2026-07-25 (orden del operador, misma logica que ejecutadoPor en un
  // toque): hoy el unico que aplaza dictando es el, y una columna que nunca se llena no protege
  // nada. QUIEN lo hizo se sabe; POR QUE no se hizo, no.
  assert.equal(fila.aplazado_por, 'Sebastian Acosta Molina');
});

test('el valor de retorno trae la empresa releida con la fecha nueva y el aplazo insertado (no un ok)', () => {
  seedEmpresa('a2', '2026-08-01');
  const resultado = aplazarSeguimientoTool({ idEmpresa: 'a2', fechaNueva: '2026-08-05' }, 1);

  assert.equal(resultado.empresa.idEmpresa, 'a2');
  assert.equal(resultado.empresa.proximoFollowUpFecha, '2026-08-05');
  assert.equal(resultado.aplazo.idEmpresa, 'a2');
  assert.equal(resultado.aplazo.fechaIncumplida, '2026-08-01');
  assert.equal(resultado.aplazo.fechaNueva, '2026-08-05');
  // La fila insertada tiene que traer su propio id (aserto explicito, no solo el shape).
  assert.ok(resultado.aplazo.id > 0);
});

test('aplazar NO inserta un toque: aplazar no es actividad', () => {
  seedEmpresa('a3', '2026-08-01');
  assert.equal(contarToques('a3'), 0);
  aplazarSeguimientoTool({ idEmpresa: 'a3', fechaNueva: '2026-08-05' }, 1);
  // Si esto alguna vez cambia a 1, aplazar empezo a contar como trabajo hecho, que es
  // exactamente lo que el comentario de repository.ts dice que no debe pasar.
  assert.equal(contarToques('a3'), 0);
});

test('append-only: tres aplazos seguidos dejan tres filas, cada una con la fecha incumplida de su momento', () => {
  seedEmpresa('a4', '2026-08-01');

  aplazarSeguimientoTool({ idEmpresa: 'a4', fechaNueva: '2026-08-05' }, 1);
  aplazarSeguimientoTool({ idEmpresa: 'a4', fechaNueva: '2026-08-10' }, 1);
  aplazarSeguimientoTool({ idEmpresa: 'a4', fechaNueva: '2026-08-15' }, 1);

  assert.equal(contarAplazos('a4'), 3);

  const raw = new Database(dbPath);
  const filas = raw
    .prepare(`SELECT fecha_incumplida, fecha_nueva FROM seguimiento_aplazado WHERE id_empresa = 'a4' ORDER BY id ASC`)
    .all() as any[];
  const empActual = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'a4'`).get() as any;
  raw.close();

  // La segunda incumple la fecha que puso la primera (2026-08-05), no la original: cada
  // aplazo captura la fecha que estaba VIGENTE en ese momento, no la del primer seed.
  assert.equal(filas[0].fecha_incumplida, '2026-08-01');
  assert.equal(filas[0].fecha_nueva, '2026-08-05');
  assert.equal(filas[1].fecha_incumplida, '2026-08-05');
  assert.equal(filas[1].fecha_nueva, '2026-08-10');
  assert.equal(filas[2].fecha_incumplida, '2026-08-10');
  assert.equal(filas[2].fecha_nueva, '2026-08-15');
  // Nada se actualiza ni se borra: la fecha vigente al final es la del ULTIMO aplazo.
  assert.equal(empActual.proximo_follow_up_fecha, '2026-08-15');
});

test('una empresa sin proximo_follow_up_fecha hace que la llamada lance y no escribe nada', () => {
  seedEmpresa('a5', null);
  assert.throws(
    () => aplazarSeguimientoTool({ idEmpresa: 'a5', fechaNueva: '2026-08-05' }, 1),
    /no tiene follow-up programado/,
  );
  // Sin fecha incumplida real que registrar, la transaccion tiene que abortar completa:
  // ninguna fila a medias en seguimiento_aplazado.
  assert.equal(contarAplazos('a5'), 0);
});

test('encola fechaProximoPaso al outbox con la fecha nueva cuando la empresa tiene notion_page_id', () => {
  seedEmpresa('a6', '2026-08-01', 'page-a6');
  aplazarSeguimientoTool({ idEmpresa: 'a6', fechaNueva: '2026-08-20' }, 1);

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-a6');
  assert.ok(fila);
  assert.equal(fila!.payload.fechaProximoPaso, '2026-08-20');
});

// La garantia que importa para el operador: aplazar deja la fecha del proximo paso movida en
// las DOS superficies, no solo en la base. Se prueba contra cambiar_cadencia y no contra un
// literal, porque el punto es que sea el MISMO camino, no uno parecido: mismo campo del
// contrato CambioNotion, misma cola que drena el worker hacia Notion.
test('aplazar encola hacia Notion por el mismo camino que cambiar_cadencia', () => {
  seedEmpresa('a13', '2026-08-01', 'page-a13');
  seedEmpresa('a14', '2026-08-01', 'page-a14');

  cambiarCadenciaTool({ idEmpresa: 'a13', proximoFollowUp: '2026-08-20' } as any, 1);
  aplazarSeguimientoTool({ idEmpresa: 'a14', fechaNueva: '2026-08-20' }, 1);

  const pendientes = outboxPendientes();
  const porCadencia = pendientes.find((p) => p.payload.notionPageId === 'page-a13');
  const porAplazo = pendientes.find((p) => p.payload.notionPageId === 'page-a14');
  assert.ok(porCadencia);
  assert.ok(porAplazo);
  assert.equal(porAplazo!.payload.fechaProximoPaso, porCadencia!.payload.fechaProximoPaso);
  // El motivo del aplazo NO viaja: no existe en el contrato CambioNotion y se queda local.
  assert.equal('motivo' in (porAplazo!.payload as Record<string, unknown>), false);
});

// Sin pagina de Notion enlazada no hay a donde sincronizar: se omite en silencio, no es un
// error (mismo comportamiento que registrarToque y cambiarCadencia).
test('una empresa sin notion_page_id no encola nada, y aplazar igual escribe en la base', () => {
  seedEmpresa('a15', '2026-08-01');
  aplazarSeguimientoTool({ idEmpresa: 'a15', fechaNueva: '2026-08-20' }, 1);

  assert.equal(contarAplazos('a15'), 1);
  assert.equal(outboxPendientes().filter((p) => p.payload.notionPageId === null).length, 0);
});

// El guard de organizacion: si la empresa esta activa en OTRA organizacion que la que
// invoca, la llamada tiene que lanzar y no tocar nada, igual que en registrarToque/marcarPerdida.
test('el guard de organizacion: idOrganizacion distinto al de la empresa lanza y no escribe nada', () => {
  seedEmpresa('a7', '2026-08-01', null, 1);
  assert.throws(() => aplazarSeguimientoTool({ idEmpresa: 'a7', fechaNueva: '2026-08-05' }, 999));

  const raw = new Database(dbPath);
  const emp = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'a7'`).get() as any;
  raw.close();
  // La fecha sigue siendo la original: el guard corta ANTES de cualquier UPDATE/INSERT.
  assert.equal(emp.proximo_follow_up_fecha, '2026-08-01');
  assert.equal(contarAplazos('a7'), 0);
});

test('registrarToqueTool con ejecutadoPor persiste el valor en toque.ejecutado_por', () => {
  seedEmpresa('a8', '2026-08-01');
  registrarToqueTool(
    { idEmpresa: 'a8', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', ejecutadoPor: 'felipe-castro' } as any,
    1,
  );

  const raw = new Database(dbPath);
  const t = raw.prepare(`SELECT ejecutado_por FROM toque WHERE id_empresa = 'a8'`).get() as any;
  raw.close();
  assert.equal(t.ejecutado_por, 'felipe-castro');
});

// Revierte la regla del 2026-07-24 (sin ejecutadoPor la columna quedaba en NULL). Decision del
// operador el 2026-07-25: dejarla vacia produjo 71 de 71 toques del mes sin atribuir, o sea el
// 100% del dato perdido para proteger el caso raro de que ejecute otro. El caso raro se sigue
// cubriendo mandando ejecutadoPor explicito, como prueba el test de arriba.
test('registrarToqueTool sin ejecutadoPor deja el ejecutor por defecto, no NULL', () => {
  seedEmpresa('a9', '2026-08-01');
  const r = registrarToqueTool({ idEmpresa: 'a9', canal: 'llamada', resultado: 'contesto_sigue_seguimiento' } as any, 1);

  const raw = new Database(dbPath);
  const t = raw.prepare(`SELECT ejecutado_por FROM toque WHERE id_empresa = 'a9'`).get() as any;
  raw.close();
  assert.equal(t.ejecutado_por, 'Sebastian Acosta Molina');
  // Y lo que devuelve la tool es lo que quedo en la base, releido: no un eco del input.
  assert.equal(r.toque.ejecutadoPor, 'Sebastian Acosta Molina');
});

test.after(() => borrarDbPrueba(dbPath));
