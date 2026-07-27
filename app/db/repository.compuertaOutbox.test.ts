// La compuerta del encolado hacia Notion, APAGADA por default (2026-07-26). Los otros
// archivos de outbox prueban el lado encendido (encenderEncoladoNotion en su cabecera); este
// prueba el default, que es el estado real de produccion: hoy no se propaga nada, y la
// capacidad queda para cuando alguien del equipo use la herramienta.
//
// Distinta de OUTBOX_NOTION_ENABLED, que apaga el DRENADO en el worker. Apagar solo el
// drenado deja la cola creciendo con filas que nadie va a entregar (19 en dos dias), y el dia
// que se encienda sale de golpe un lote de cambios viejos como si fueran de hoy.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, encenderEncoladoNotion } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToque, marcarPerdida, cambiarCadencia, aplazarSeguimiento, actualizarEstadoNotion, outboxPendientes } =
  await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, notionPageId: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id, proximo_follow_up_fecha)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1, ?, '2026-07-30')`,
  ).run(id, id, id, notionPageId);
  db.close();
}

function filasOutbox(): number {
  const db = raw();
  const n = (db.prepare('SELECT count(*) n FROM outbox').get() as { n: number }).n;
  db.close();
  return n;
}

function toquesDe(idEmpresa: string): number {
  const db = raw();
  const n = (db.prepare('SELECT count(*) n FROM toque WHERE id_empresa = ?').get(idEmpresa) as { n: number }).n;
  db.close();
  return n;
}

seedEmpresa('cmp-1', 'page-cmp-1');
seedEmpresa('cmp-2', 'page-cmp-2');
seedEmpresa('cmp-3', 'page-cmp-3');
seedEmpresa('cmp-4', 'page-cmp-4');
seedEmpresa('cmp-5', 'page-cmp-5');

// Los cuatro puntos que hasta hoy encolaban sin preguntar. Se prueban juntos a proposito: la
// compuerta es UNA, y lo que hay que poder afirmar es que ninguno de los cuatro se escapa.
test('con la compuerta apagada, ninguno de los cuatro puntos encola', () => {
  registrarToque(
    { idEmpresa: 'cmp-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'hablamos', proximoFollowUp: '2026-08-01' },
    1,
  );
  marcarPerdida({ idEmpresa: 'cmp-2', canal: 'llamada', razonPerdida: 'sin_presupuesto', quePaso: 'no hay plata este ano' }, 1);
  cambiarCadencia({ idEmpresa: 'cmp-3', proximoFollowUp: '2026-08-05', proximoCanal: 'whatsapp' }, 1);
  aplazarSeguimiento({ idEmpresa: 'cmp-4', fechaNueva: '2026-08-10', motivo: 'plan_irreal' }, 1);

  assert.equal(filasOutbox(), 0, 'la cola no crece con la compuerta apagada');
});

// La compuerta apaga la PROPAGACION, no la funcionalidad: el hecho se sigue registrando en la
// base igual que siempre. Si esto se rompiera, apagar el sync habria apagado el registro, que
// es lo contrario de lo que se pidio.
test('apagada no quita funcionalidad: el toque queda escrito igual', () => {
  assert.equal(toquesDe('cmp-1'), 1);

  const db = raw();
  const emp = db.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa='cmp-3'`).get() as {
    proximo_follow_up_fecha: string;
  };
  db.close();
  assert.equal(emp.proximo_follow_up_fecha, '2026-08-05', 'cambiar_cadencia si movio la fecha en la base');
});

// El quinto punto ya preguntaba (opts.encolarNotion), y la compuerta manda sobre el: con la
// compuerta cerrada, pedir explicitamente que encole tampoco encola. Un solo interruptor, no
// dos que haya que acordarse de bajar los dos.
test('apagada gana sobre un encolarNotion:true explicito', () => {
  actualizarEstadoNotion('cmp-5', 'oportunidad', 1, '2026-07-26', { encolarNotion: true, origenTransicion: 'manual' });
  assert.equal(filasOutbox(), 0);

  const db = raw();
  const emp = db.prepare(`SELECT estado_notion FROM empresa WHERE id_empresa='cmp-5'`).get() as { estado_notion: string };
  db.close();
  assert.equal(emp.estado_notion, 'oportunidad', 'la etapa si se movio en la base');
});

// Lo que ya estaba encolado no se toca: la compuerta corta el flujo hacia adelante, no borra
// la cola. Las 19 filas de produccion siguen ahi el dia que alguien decida drenarlas.
test('encenderla vuelve a encolar, y lo viejo sigue donde estaba', () => {
  const db = raw();
  db.prepare(
    `INSERT INTO outbox (entidad, id_registro, payload, estado, intentos, created_at)
     VALUES ('empresa','vieja','{"notionPageId":"page-vieja"}','aprobado',0,'2026-07-24T00:00:00.000Z')`,
  ).run();
  db.close();

  encenderEncoladoNotion(dbPath);
  registrarToque(
    { idEmpresa: 'cmp-1', canal: 'whatsapp', resultado: 'no_contesto', quePaso: 'le escribi', proximoFollowUp: '2026-08-02' },
    1,
  );

  const pendientes = outboxPendientes();
  assert.ok(pendientes.some((p) => p.payload.notionPageId === 'page-vieja'), 'la fila vieja sigue en la cola');
  assert.ok(pendientes.some((p) => p.payload.notionPageId === 'page-cmp-1'), 'y la nueva ya entra');
});
