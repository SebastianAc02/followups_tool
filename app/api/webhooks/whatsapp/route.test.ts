// El webhook de Evolution guardando lo que SALE (2026-07-26). Lo que estas pruebas cubren y
// no cubren ni el parser ni el repository por separado: que el saliente entra por el mismo
// endpoint sin desviar el camino del entrante, que se matchea contra el contacto por el
// telefono del destinatario, y que un error guardandolo no se convierte en 5xx (Evolution
// reintenta ante un 5xx y eso reprocesaria el payload).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../../../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
// Base de pruebas REAL (un archivo con esquema), no :memory:. El webhook resuelve a que base
// pertenece la linea consultando linea_whatsapp en LAS DOS conexiones (db/ruteo-linea.ts), asi
// que la de pruebas tiene que existir con su esquema o el endpoint truena antes de guardar
// nada. Ninguna de las dos tiene lineas sembradas: sin fila en pruebas gana la real, que es
// justo la asimetria que ruteo-linea documenta.
process.env.PRUEBAS_DB_PATH = crearDbPrueba();
delete process.env.WHATSAPP_WEBHOOK_TOKEN; // sin token exigido: dev local procesa igual

const { POST } = await import('./route.ts');

function raw() {
  return new Database(dbPath);
}

{
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES ('emp-hook','nit','Emp Hook','emp hook','activo','on_hold',1)`,
  ).run();
  // Telefono guardado con formato humano y sin indicativo: el match es por los ultimos 10
  // digitos, el mismo criterio que ya usaba el entrante.
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, fuente)
     VALUES ('emp-hook','Andres',0,1,'302 248 2292','seed')`,
  ).run();
  db.close();
}

function payloadSaliente(mensajeId: string, texto: string) {
  return {
    event: 'messages.upsert',
    instance: 'linea-hook',
    data: {
      key: { remoteJid: '573022482292@s.whatsapp.net', fromMe: true, id: mensajeId },
      message: { conversation: texto },
      messageType: 'conversation',
      messageTimestamp: 1785110400,
    },
  };
}

function pedir(body: unknown) {
  return POST(
    new Request('http://localhost/api/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function filaDe(mensajeId: string) {
  const db = raw();
  const f = db
    .prepare(`SELECT direccion, es_apertura, texto, id_contacto, referencia_proveedor FROM mensaje_whatsapp WHERE mensaje_id = ?`)
    .get(mensajeId) as { direccion: string; es_apertura: number; texto: string; id_contacto: number | null; referencia_proveedor: string } | undefined;
  db.close();
  return f;
}

test('un mensaje que sale queda guardado, matcheado a su contacto y marcado apertura', async () => {
  const res = await pedir(payloadSaliente('hook-1', 'Hola Andres, te escribo de OnePay'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, saliente: true });

  const f = filaDe('hook-1');
  assert.equal(f?.direccion, 'saliente');
  assert.equal(f?.texto, 'Hola Andres, te escribo de OnePay');
  assert.equal(f?.referencia_proveedor, 'linea-hook');
  assert.ok(f?.id_contacto, 'matcheo al contacto por los ultimos 10 digitos');
  assert.equal(f?.es_apertura, 1);
});

// Evolution reintenta el mismo payload. Sin idempotencia real, el reintento duplicaria el
// mensaje de apertura y el conteo del lunes quedaria inflado por la red.
test('el reintento del mismo mensaje responde 200 y no duplica la fila', async () => {
  const res = await pedir(payloadSaliente('hook-1', 'Hola Andres, te escribo de OnePay'));
  assert.equal(res.status, 200);

  const db = raw();
  const n = (db.prepare(`SELECT count(*) n FROM mensaje_whatsapp WHERE mensaje_id='hook-1'`).get() as { n: number }).n;
  db.close();
  assert.equal(n, 1);
});

test('un segundo saliente a la misma cuenta ya no es apertura', async () => {
  await pedir(payloadSaliente('hook-2', 'Te reitero por si no lo viste'));
  assert.equal(filaDe('hook-2')?.es_apertura, 0);
});

// BLOQUEANTE de privacidad: la linea del operador es personal y de trabajo a la vez. Un
// mensaje suyo a un numero que no es contacto de ninguna cuenta es una conversacion privada y
// no entra a una base comercial. El filtro es por destinatario, con el mismo match de ultimos
// 10 digitos que usa el entrante.
test('un saliente a un numero que no es de ninguna cuenta no se guarda', async () => {
  const privado = {
    ...payloadSaliente('hook-privado', 'nos vemos en la casa de mi mama a las 7'),
    data: {
      ...payloadSaliente('hook-privado', 'nos vemos en la casa de mi mama a las 7').data,
      key: { remoteJid: '573159876543@s.whatsapp.net', fromMe: true, id: 'hook-privado' },
    },
  };
  const res = await pedir(privado);
  assert.equal(res.status, 200, 'se acusa recibo igual: Evolution no debe reintentar');
  assert.deepEqual(await res.json(), { ok: true, ignorado: 'saliente sin cuenta' });

  assert.equal(filaDe('hook-privado'), undefined, 'ni la fila, ni el texto, ni el numero');
});

// El acuse tampoco puede delatar el contenido: lo que vuelve es identico mire quien mire, y no
// dice a quien se le escribio ni que se dijo.
test('el acuse del descarte no filtra ni el numero ni el texto', async () => {
  const otroPrivado = {
    ...payloadSaliente('hook-privado-2', 'te transfiero la plata del arriendo'),
    data: {
      ...payloadSaliente('hook-privado-2', 'te transfiero la plata del arriendo').data,
      key: { remoteJid: '573001112233@s.whatsapp.net', fromMe: true, id: 'hook-privado-2' },
    },
  };
  const cuerpo = JSON.stringify(await (await pedir(otroPrivado)).json());
  assert.ok(!cuerpo.includes('573001112233'));
  assert.ok(!cuerpo.includes('arriendo'));
});

// El endpoint sigue ignorando lo que no le toca: un cambio en el camino del saliente no puede
// ampliar lo que la base guarda por accidente.
test('lo que no es un mensaje con texto se sigue ignorando', async () => {
  const res = await pedir({ event: 'connection.update', instance: 'linea-hook', data: { state: 'open' } });
  assert.deepEqual(await res.json(), { ok: true, ignorado: true });

  const db = raw();
  const n = (db.prepare(`SELECT count(*) n FROM mensaje_whatsapp`).get() as { n: number }).n;
  db.close();
  assert.equal(n, 2, 'solo las dos filas de los tests anteriores');
});

// Regresion del camino que ya funcionaba: el entrante entra primero y sigue guardandose como
// entrante. Es la mitad que no se podia romper al agregar el saliente.
test('el entrante sigue entrando por su camino de siempre', async () => {
  const entrante = {
    ...payloadSaliente('hook-in-1', 'Si me interesa, cuentame mas'),
    data: {
      ...payloadSaliente('hook-in-1', 'Si me interesa, cuentame mas').data,
      key: { remoteJid: '573022482292@s.whatsapp.net', fromMe: false, id: 'hook-in-1' },
    },
  };
  const res = await pedir(entrante);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const f = filaDe('hook-in-1');
  assert.equal(f?.direccion, 'entrante');
  assert.equal(f?.es_apertura, 0, 'un entrante nunca abre: no lo redactamos nosotros');
});
