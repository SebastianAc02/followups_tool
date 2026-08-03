// El pixel y el clic escribiendo en la base que les corresponde (2026-08-03).
//
// Lo que cubre esto y no cubria nada: que un evento de tracking de una campana de PRUEBA caiga
// en pruebas.db y no se pierda. Hasta hoy estas dos rutas entraban sin sesion, no declaraban
// modo, correlacionaban siempre contra isps.db y descartaban en silencio lo que no encontraban.
// Medido antes del arreglo: pruebas.db tenia 1 fila en evento_tracking y era sembrada a mano.
//
// Las dos bases son archivos con esquema (no :memory:) por la misma razon que el test del
// webhook de Evolution: esCampanaDePruebas consulta LAS DOS conexiones, asi que las dos tienen
// que existir de verdad o el endpoint truena antes de escribir nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../../db/test-helpers.ts';

const dbRealPath = crearDbPrueba();
const dbPruebasPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbRealPath;
process.env.PRUEBAS_DB_PATH = dbPruebasPath;

const { GET: abrir } = await import('./open/route.ts');
const { GET: clic } = await import('./click/route.ts');

// Siembra el camino completo que resolverDestinatarioPorEmail necesita: empresa -> contacto ->
// campana -> inscripcion -> destinatario -> paso_inscripcion ENVIADA (solo un paso ya enviado
// correlaciona: un pixel de algo que no salio no significa nada).
function sembrarEnvio(dbPath: string, opts: { proveedorCampanaId: string; email: string; sufijo: string }) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'lead', 1)`,
  ).run(`emp-${opts.sufijo}`, `Empresa ${opts.sufijo}`, `empresa ${opts.sufijo}`);
  const contacto = db
    .prepare(
      `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente)
       VALUES (?, 'Contacto', 0, 1, ?, 'seed')`,
    )
    .run(`emp-${opts.sufijo}`, opts.email);
  const campana = db
    .prepare(
      `INSERT INTO campana (nombre, id_cadencia, id_segmento, id_organizacion, proveedor_campana_id)
       VALUES (?, 1, 1, 1, ?)`,
    )
    .run(`Campana ${opts.sufijo}`, opts.proveedorCampanaId);
  const inscripcion = db
    .prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`)
    .run(campana.lastInsertRowid, `emp-${opts.sufijo}`);
  const destinatario = db
    .prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto) VALUES (?, ?)`)
    .run(inscripcion.lastInsertRowid, contacto.lastInsertRowid);
  db.prepare(
    `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_enviada)
     VALUES (?, 1, 1, 'correo', 'enviada', '2026-08-03T12:00:00.000Z')`,
  ).run(destinatario.lastInsertRowid);
  db.close();
}

function eventos(dbPath: string): { tipo: string; detalle: string | null }[] {
  const db = new Database(dbPath);
  const filas = db.prepare(`SELECT tipo, detalle FROM evento_tracking`).all() as { tipo: string; detalle: string | null }[];
  db.close();
  return filas;
}

const EMAIL = 'contacto@ejemplo.com';
sembrarEnvio(dbPruebasPath, { proveedorCampanaId: 'gmail-camp-7', email: EMAIL, sufijo: 'prueba' });
sembrarEnvio(dbRealPath, { proveedorCampanaId: 'apollo-real-1', email: EMAIL, sufijo: 'real' });
// La colision: el mismo correlator sintetico en las dos bases. Gana la real (ver ruteo-campana).
sembrarEnvio(dbPruebasPath, { proveedorCampanaId: 'gmail-camp-42', email: EMAIL, sufijo: 'prueba-colision' });
sembrarEnvio(dbRealPath, { proveedorCampanaId: 'gmail-camp-42', email: EMAIL, sufijo: 'real-colision' });

function pedirApertura(c: string, e: string) {
  return abrir(new Request(`http://localhost/api/track/open?c=${encodeURIComponent(c)}&e=${encodeURIComponent(e)}`));
}

test('la apertura de una campana de prueba se guarda en pruebas.db, no en la real', async () => {
  const res = await pedirApertura('gmail-camp-7', EMAIL);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/gif', 'el pixel se entrega siempre');

  const enPruebas = eventos(dbPruebasPath).filter((f) => f.tipo === 'abierto');
  assert.equal(enPruebas.length, 1, 'el evento tiene que existir en la base de pruebas');
  assert.equal(eventos(dbRealPath).filter((f) => f.tipo === 'abierto').length, 0, 'isps.db no recibe nada');
});

test('la apertura de una campana real sigue yendo a isps.db', async () => {
  await pedirApertura('apollo-real-1', EMAIL);
  assert.equal(eventos(dbRealPath).filter((f) => f.tipo === 'abierto').length, 1);
});

// El invariante que protege produccion: la ambiguedad nunca desvia una apertura real hacia la
// base de prueba, porque ese evento se perderia del lado que importa.
test('con el correlator en LAS DOS bases, la apertura cae en la real', async () => {
  await pedirApertura('gmail-camp-42', EMAIL);
  assert.equal(eventos(dbRealPath).filter((f) => f.tipo === 'abierto').length, 2, 'suma a la real');
  assert.equal(eventos(dbPruebasPath).filter((f) => f.tipo === 'abierto').length, 1, 'pruebas.db no se movio');
});

test('un correlator que no existe en ningun lado no escribe nada y devuelve el pixel igual', async () => {
  const antesReal = eventos(dbRealPath).length;
  const antesPruebas = eventos(dbPruebasPath).length;
  const res = await pedirApertura('gmail-camp-inexistente', EMAIL);
  assert.equal(res.status, 200);
  assert.equal(eventos(dbRealPath).length, antesReal);
  assert.equal(eventos(dbPruebasPath).length, antesPruebas);
});

// El merge-tag sin sustituir: Apollo no reemplazo {{email}}. No hay con que correlacionar.
test('el pixel se entrega aunque el merge-tag venga sin sustituir', async () => {
  const res = await pedirApertura('gmail-camp-7', '{{email}}');
  assert.equal(res.status, 200);
  assert.equal(eventos(dbPruebasPath).filter((f) => f.tipo === 'abierto').length, 1, 'no suma un evento inservible');
});

function pedirClic(c: string, e: string, u: string) {
  return clic(
    new Request(
      `http://localhost/api/track/click?c=${encodeURIComponent(c)}&e=${encodeURIComponent(e)}&u=${encodeURIComponent(u)}`,
    ),
  );
}

test('el clic de una campana de prueba se guarda en pruebas.db y redirige igual', async () => {
  const res = await pedirClic('gmail-camp-7', EMAIL, 'https://onepay.la/precios');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://onepay.la/precios');
  assert.equal(eventos(dbPruebasPath).filter((f) => f.tipo === 'clic').length, 1);
  assert.equal(eventos(dbRealPath).filter((f) => f.tipo === 'clic').length, 0);
});

// Sigue siendo una ruta publica: no se vuelve un open-redirect para cualquier esquema.
test('el clic con una url no http(s) responde 400 y no escribe', async () => {
  const res = await pedirClic('gmail-camp-7', EMAIL, 'javascript:alert(1)');
  assert.equal(res.status, 400);
  assert.equal(eventos(dbPruebasPath).filter((f) => f.tipo === 'clic').length, 1, 'sigue habiendo uno solo');
});

test('el clic sin correlator redirige igual, sin escribir', async () => {
  const res = await clic(new Request(`http://localhost/api/track/click?u=${encodeURIComponent('https://onepay.la')}`));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://onepay.la/');
  assert.equal(eventos(dbPruebasPath).filter((f) => f.tipo === 'clic').length, 1);
});
