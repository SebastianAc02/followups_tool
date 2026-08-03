// Aprobar-y-programar desde la WEB (2026-08-03). Mide la cadena entera que habilita el boton
// nuevo de /cola, sin pasar por Next: hora de Bogota -> instante -> aprobarYProgramarPaso ->
// gate del worker.
//
// Por que hacia falta: pasoInscripcionesPendientes exige aprobado_en para TODO paso de
// whatsapp, manual o automatico, y el unico camino que llenaba esa columna era
// aprobarYProgramarPaso, que vivia solo en el MCP. El MCP corre siempre contra isps.db, asi
// que en modo prueba el canal WhatsApp no tenia por donde salir: el paso se materializaba y se
// quedaba ahi para siempre.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';
import { instanteBogota, calcularHorarioEscalonado } from '../core/horario-escalonado.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  historialInscripciones,
  destinatariosDeInscripcion,
  crearPasoInscripcionPendiente,
  pasoInscripcionesPendientes,
  aprobarYProgramarPaso,
  agendaHoyCadencias,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, ciudad: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal, owner)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', ?, 'Camilo Fonseca')`,
  ).run(id, id, id.toLowerCase(), ciudad);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, telefono, fuente)
     VALUES (?, 'Contacto', 0, 1, ?, '+573001234567', 'seed')`,
  ).run(id, `${id}@empresa.test`);
  db.close();
}

function seedLinea() {
  const db = raw();
  db.prepare(`INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor, estado) VALUES ('573000000000', 'pool', 'instancia-web', 'activa')`).run();
  db.close();
}

function idsPasoYVersion(idCadencia: number) {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as { id_paso: number };
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as { id_version: number };
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

seedLinea();
seedEmpresa('e-web-wa', 'web-wa');

// esManual 0: un paso AUTOMATICO de whatsapp. Es el caso que mas dolia -- la web no tenia
// ningun boton para el, porque "aprobar" en la web significaba "ya lo mande yo".
const idCadencia = crearCadencia({
  nombre: 'C web',
  pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'Hola [nombre], plantilla' }],
});
const idSegmento = guardarSegmento(
  { nombre: 'web-seg', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['web-wa'] }] } },
  1,
);
const idCampana = crearCampana({ nombre: 'Camp web', idCadencia, idSegmento }, 1);
inscribirCampana(idCampana, 1);
const { idPaso, idVersion } = idsPasoYVersion(idCadencia);
const idDestinatario = destinatariosDeInscripcion(historialInscripciones('e-web-wa').find((i) => i.estado === 'activa')!.id)[0].id;
const idPasoInscripcion = crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'whatsapp' });

test('sin aprobar, un paso de whatsapp no sale nunca: el worker no lo ve', () => {
  const pendientes = pasoInscripcionesPendientes('whatsapp', '2026-08-03T23:00:00.000Z');
  assert.equal(pendientes.some((f) => f.idPasoInscripcion === idPasoInscripcion), false);
});

test('aprobar-y-programar a las 11:00 de Bogotá lo deja elegible a esa hora y no antes', () => {
  const horario = calcularHorarioEscalonado(instanteBogota('2026-08-03', '11:00'), 1, 0);
  const r = aprobarYProgramarPaso(idPasoInscripcion, 'Hola Ana, texto revisado', horario[0].fechaProgramada, 'Camilo Fonseca');
  assert.equal(r.ok, true);

  // 10:59 en Bogotá (15:59 UTC): todavia no.
  assert.equal(
    pasoInscripcionesPendientes('whatsapp', '2026-08-03T15:59:00.000Z').some((f) => f.idPasoInscripcion === idPasoInscripcion),
    false,
    'antes de la hora no sale, o "programado" no significaria nada',
  );

  // 11:01 en Bogotá (16:01 UTC): ahora si, y con el copy revisado, no la plantilla.
  const fila = pasoInscripcionesPendientes('whatsapp', '2026-08-03T16:01:00.000Z').find(
    (f) => f.idPasoInscripcion === idPasoInscripcion,
  );
  assert.ok(fila, 'pasada la hora, el worker ya lo ve');
  assert.equal(fila!.paso.cuerpo, 'Hola Ana, texto revisado');
  assert.equal(fila!.proveedorCampanaId, 'instancia-web');
});

test('el paso sigue PENDIENTE y sin toque: aprobar para que salga no es "ya lo mandé yo"', () => {
  const db = raw();
  const paso = db
    .prepare('SELECT estado, aprobado_en, aprobado_por FROM paso_inscripcion WHERE id_paso_inscripcion = ?')
    .get(idPasoInscripcion) as { estado: string; aprobado_en: string | null; aprobado_por: string | null };
  const toques = db.prepare(`SELECT count(*) c FROM toque WHERE id_empresa = 'e-web-wa'`).get() as { c: number };
  db.close();

  assert.equal(paso.estado, 'pendiente');
  assert.ok(paso.aprobado_en, 'aprobado_en es la constancia de que un humano leyó el texto');
  assert.equal(paso.aprobado_por, 'Camilo Fonseca');
  // aprobarPasoManual (el otro botón) dejaría estado 'enviada' y un toque. Este no: todavía no
  // ha pasado nada que contar.
  assert.equal(toques.c, 0);
});

test('la pantalla puede decir si ya está aprobado: agendaHoyCadencias trae aprobadoEn', () => {
  const fila = agendaHoyCadencias('2026-08-04').find((p) => p.idPasoInscripcion === idPasoInscripcion);
  assert.ok(fila, 'el paso sigue en la caja de cadencias del día');
  assert.ok(fila!.aprobadoEn, 'sin este campo la pantalla no puede distinguir aprobado de sin aprobar');
  assert.ok(fila!.fechaProgramada?.startsWith('2026-08-03T16:00'), 'y muestra la hora a la que quedó programado');
});

test('un paso que ya salió no se puede reprogramar: reescribir su copy sería falsificar el registro', () => {
  const db = raw();
  db.prepare(`UPDATE paso_inscripcion SET estado = 'enviada' WHERE id_paso_inscripcion = ?`).run(idPasoInscripcion);
  db.close();

  const r = aprobarYProgramarPaso(idPasoInscripcion, 'otro texto', '2026-08-04T16:00:00.000Z', 'Camilo Fonseca');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, 'ya_salio');
});
