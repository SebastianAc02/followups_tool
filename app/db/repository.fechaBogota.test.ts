// El dia de calendario que escribe el repository es el de Bogota, nunca el de UTC.
//
// El defecto que estas pruebas cierran es uno solo con cuatro radios de daño:
// `new Date().toISOString().slice(0, 10)` devuelve el dia en hora universal, y entre las 19:00
// y la medianoche de Colombia eso ya es MAÑANA. Medido en produccion el 2026-07-28: los toques
// 193 y 196 quedaron fechados 2026-07-09 y 2026-07-10 cuando ocurrieron el 08 y el 09, los dos
// escritos por la web entre las 22:33 y las 22:39 hora Bogota. fecha_dia es justo la columna
// sobre la que se cuenta la actividad diaria del operador, que dicta sus toques de noche.
//
// Toda la simulacion se ancla en 2026-07-29T01:00:00.000Z, que son las 20:00 del 28 de julio en
// Bogota: el instante donde el dia UTC y el dia local ya no coinciden. Sin fijar el reloj estas
// pruebas pasarian todo el dia por accidente y solo fallarian de noche, que es exactamente como
// el bug sobrevivio hasta ahora.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  registrarToque,
  marcarPerdida,
  enviosGmailHoy,
  crearCadencia,
  guardarSegmento,
  crearCampana,
  fijarOwnerCampana,
  crearPasoInscripcionPendiente,
  marcarPasoInscripcionEnviada,
  inscribirCampana,
  destinatariosDeInscripcion,
  historialInscripciones,
} = await import('./repository.ts');

// Las 20:00 del 28 de julio en Bogota. En UTC ya es el 29.
const INSTANTE_8PM_BOGOTA = new Date('2026-07-29T01:00:00.000Z');
const DIA_BOGOTA = '2026-07-28';
const DIA_UTC = '2026-07-29';

// La conexion de lectura es OTRA, abierta aparte y cerrada en cada consulta: lo que se afirma
// es lo que quedo escrito en el archivo, no lo que la funcion dice haber escrito.
function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, contactos: { email: string; principal?: boolean }[] = []) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 'isp', 1)`,
  ).run(id, id, id.toLowerCase());
  for (const c of contactos) {
    db.prepare(
      `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES (?, 'Contacto', 0, ?, ?, 'seed')`,
    ).run(id, c.principal ? 1 : 0, c.email);
  }
  db.close();
}

function toquesDe(idEmpresa: string): { fecha: string; fecha_dia: string | null }[] {
  const db = raw();
  const filas = db
    .prepare('SELECT fecha, fecha_dia FROM toque WHERE id_empresa = ? ORDER BY id_toque')
    .all(idEmpresa) as { fecha: string; fecha_dia: string | null }[];
  db.close();
  return filas;
}

function conRelojEn8pmBogota<T>(fn: () => T): T {
  mock.timers.enable({ apis: ['Date'], now: INSTANTE_8PM_BOGOTA });
  try {
    return fn();
  } finally {
    mock.timers.reset();
  }
}

seedEmpresa('fb-toque');
seedEmpresa('fb-toque-fecha-dicha');
seedEmpresa('fb-perdida');

test('el reloj simulado de verdad cae en el borde: 20:00 en Bogota, 01:00 del dia siguiente en UTC', () => {
  conRelojEn8pmBogota(() => {
    assert.equal(new Date().toISOString().slice(0, 10), DIA_UTC);
  });
});

// -- 1. registrarToque, el que mas duele: alimenta el conteo de actividad diaria --
test('registrarToque a las 8pm de Bogota escribe fecha_dia del dia de HOY, no del de mañana', () => {
  conRelojEn8pmBogota(() => {
    registrarToque({ idEmpresa: 'fb-toque', canal: 'llamada', resultado: 'no_contesto', quePaso: 'timbro y nada' }, 1);
  });

  const [fila] = toquesDe('fb-toque');
  assert.equal(fila.fecha_dia, DIA_BOGOTA);
  assert.notEqual(fila.fecha_dia, DIA_UTC);
});

// `fecha` es un INSTANTE, no un dia de calendario, y ahi UTC es lo correcto. Si alguien
// "arregla" tambien esta columna a hora local, dos filas escritas en husos distintos dejan de
// ser comparables entre si.
test('el timestamp del toque se queda en UTC: lo que se corrige es el dia, no el instante', () => {
  const [fila] = toquesDe('fb-toque');
  assert.equal(fila.fecha, INSTANTE_8PM_BOGOTA.toISOString());
});

test('un dia dicho explicitamente gana sobre el reloj y no se reinterpreta', () => {
  conRelojEn8pmBogota(() => {
    registrarToque(
      { idEmpresa: 'fb-toque-fecha-dicha', canal: 'whatsapp', resultado: 'no_contesto', quePaso: 'toque de la semana pasada', fecha: '2026-07-20' },
      1,
    );
  });

  const [fila] = toquesDe('fb-toque-fecha-dicha');
  assert.equal(fila.fecha_dia, '2026-07-20');
  // Anclado a mediodia UTC = 7am de Bogota, que cae en el MISMO dia por los dos lados.
  assert.equal(fila.fecha, '2026-07-20T12:00:00.000Z');
});

// -- 2. marcarPerdida: mismo defecto, mismo arreglo --
test('marcarPerdida a las 8pm de Bogota tambien fecha el toque en el dia de hoy', () => {
  conRelojEn8pmBogota(() => {
    marcarPerdida({ idEmpresa: 'fb-perdida', canal: 'llamada', razonPerdida: 'sin_presupuesto', quePaso: 'no hay plata este año' }, 1);
  });

  const [fila] = toquesDe('fb-perdida');
  assert.equal(fila.fecha_dia, DIA_BOGOTA);
});

// -- 3. El goteo de inscribirCampana: una campaña sin fecha_inicio arranca "hoy" --
const idCadencia = crearCadencia({ nombre: 'C goteo bogota', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x' }] });
const idSegmento = guardarSegmento(
  { nombre: 'seg-bogota', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }] } },
  1,
);
const idCampana = crearCampana({ nombre: 'Camp goteo bogota', idCadencia, idSegmento }, 1);
fijarOwnerCampana(idCampana, 'Ana Goteo');

test('el goteo de una campaña sin fecha_inicio arranca en el dia de Bogota, no en el de UTC', () => {
  seedEmpresa('fb-goteo', [{ email: 'goteo@empresa.com', principal: true }]);

  conRelojEn8pmBogota(() => {
    inscribirCampana(idCampana, 1);
  });

  const db = raw();
  const fila = db.prepare('SELECT fecha_inscripcion FROM inscripcion WHERE id_empresa = ?').get('fb-goteo') as { fecha_inscripcion: string };
  db.close();
  // El 28 de julio de 2026 es martes: siguienteHabil no lo mueve. Antes del arreglo esto
  // arrancaba el 29 y corria toda la cola de la campaña un dia.
  assert.equal(fila.fecha_inscripcion.slice(0, 10), DIA_BOGOTA);
});

// -- 4. El tope diario de Gmail: las dos puntas de la comparacion en la misma zona --
test('el tope de Gmail cuenta un envio de las 8pm bajo el dia de Bogota', () => {
  const idCadenciaGmail = crearCadencia({ nombre: 'C gmail bogota', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x' }] });
  const idSegmentoGmail = guardarSegmento(
    { nombre: 'seg-gmail-bogota', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }] } },
    1,
  );
  const idCampanaGmail = crearCampana({ nombre: 'Camp gmail bogota', idCadencia: idCadenciaGmail, idSegmento: idSegmentoGmail }, 1);
  fijarOwnerCampana(idCampanaGmail, 'Ana Tope');

  const db = raw();
  db.prepare(
    `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, 'Ana Tope', 'Ana Tope', 'user-ana-tope')`,
  ).run();
  db.close();

  seedEmpresa('fb-tope', [{ email: 'tope@empresa.com', principal: true }]);
  inscribirCampana(idCampanaGmail, 1);

  const hist = historialInscripciones('fb-tope').find((i) => i.estado === 'activa')!;
  const idDestinatario = destinatariosDeInscripcion(hist.id)[0]?.id;
  assert.ok(idDestinatario, 'la inscripcion deberia tener destinatario');

  const dbPaso = raw();
  const paso = dbPaso.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadenciaGmail) as any;
  const version = dbPaso.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as any;
  dbPaso.close();

  const idPasoInscripcion = crearPasoInscripcionPendiente({ idDestinatario, idPaso: paso.id_paso, idVersion: version.id_version, canal: 'correo' });
  // Enviado a las 20:00 de Bogota: la columna guarda el instante en UTC, o sea con el dia 29.
  marcarPasoInscripcionEnviada(idPasoInscripcion, 'gmail', 'msg-bogota-1', INSTANTE_8PM_BOGOTA.toISOString());

  // Lo que el tope tiene que contestar: ese envio pertenece al dia 28 de Bogota. Arreglar solo
  // el caller y dejar la columna comparandose en UTC daria 0 aca, y el tope diario se
  // reiniciaria a las 19:00 dejando mandar el cupo entero otra vez el mismo dia.
  assert.equal(enviosGmailHoy('user-ana-tope', 1, DIA_BOGOTA), 1);
  assert.equal(enviosGmailHoy('user-ana-tope', 1, DIA_UTC), 0, 'el envio no pertenece al dia siguiente');
});

test('enviosGmailHoy sin dia explicito usa el dia de Bogota', () => {
  conRelojEn8pmBogota(() => {
    assert.equal(enviosGmailHoy('user-ana-tope', 1), 1);
  });
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
