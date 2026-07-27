// programar_envios (escritura) y envios_programados (lectura), 2026-07-26. El gesto de la
// manana: revisar los copys de apertura entre 8:00 y 8:30 y dejarlos programados para las 11:00.
//
// Lo mas importante que fija este archivo no es que programar funcione: es que un WhatsApp SIN
// revisar no salga nunca. "WhatsApp nunca se automatiza en este sistema" era una regla escrita
// que el codigo no cumplia -- el worker empujaba cualquier paso de whatsapp que se
// materializara, y en produccion habia 8 esperando sin que nadie los hubiera leido.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { programarEnviosTool, enviosProgramadosTool } = await import('./tools.ts');
const { crearMcpServer, TOOLS_LECTURA, TOOLS_ESCRITURA } = await import('./server.ts');
const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  historialInscripciones,
  destinatariosDeInscripcion,
  crearPasoInscripcionPendiente,
  pasoInscripcionesPendientes,
  marcarPasoInscripcionEnviada,
} = await import('../db/repository.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, ciudad: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?, 1, 'Sebastian Acosta Molina')`,
  ).run(id, id, id, ciudad);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, email, fuente)
     VALUES (?, 'Contacto', 0, 1, ?, ?, 'seed')`,
  ).run(id, `57300000${id.slice(-4)}`, `${id}@e.com`);
  db.close();
}

seedEmpresa('pr-1', 'pr-cat');
seedEmpresa('pr-2', 'pr-cat');

// esManual: true a proposito, porque es como estan los SIETE pasos reales de produccion
// (verificado el 2026-07-26: los 8 pasos de whatsapp pendientes tienen es_manual = 1). Un paso
// manual exige que un humano lea el texto antes de que salga, y programar_envios es esa lectura.
const idCadencia = crearCadencia({
  nombre: 'C prog',
  pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'Plantilla generica', esManual: true }],
});
const idSegmento = guardarSegmento(
  { nombre: 'pr-seg', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['pr-cat'] }] } },
  1,
);
const idCampana = crearCampana({ nombre: 'Camp prog', idCadencia, idSegmento }, 1);
inscribirCampana(idCampana, 1);

const db0 = raw();
const paso = db0.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as { id_paso: number };
const version = db0.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as { id_version: number };
// linea activa: sin ella el push de whatsapp se salta la fila entera y el test del gate no
// probaria nada (pasaria por el motivo equivocado).
db0.prepare(`INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor, estado) VALUES ('573000000000','pool','wa-prog','activa')`).run();
db0.close();

function idDestinatarioDe(idEmpresa: string): number {
  const h = historialInscripciones(idEmpresa).find((i) => i.estado === 'activa')!;
  return destinatariosDeInscripcion(h.id)[0].id;
}

const idPaso1 = crearPasoInscripcionPendiente({
  idDestinatario: idDestinatarioDe('pr-1'),
  idPaso: paso.id_paso,
  idVersion: version.id_version,
  canal: 'whatsapp',
  fechaProgramada: '2026-07-27',
});
const idPaso2 = crearPasoInscripcionPendiente({
  idDestinatario: idDestinatarioDe('pr-2'),
  idPaso: paso.id_paso,
  idVersion: version.id_version,
  canal: 'whatsapp',
  fechaProgramada: '2026-07-27',
});

// EL TEST QUE IMPORTA. Antes de aprobar nada, el worker no puede llevarse estos pasos, aunque
// su fecha ya haya pasado y la linea este activa.
test('un WhatsApp sin revisar NO sale, por mas que su hora haya llegado', () => {
  const pendientes = pasoInscripcionesPendientes('whatsapp', '2026-07-27T23:00:00.000Z');
  assert.equal(pendientes.length, 0, 'sin aprobacion humana no hay nada que empujar');
});

test('programar deja el copy revisado, aprobado y con su hora, y devuelve lo releido', () => {
  const r = programarEnviosTool({
    pasos: [
      { idPasoInscripcion: idPaso1, cuerpo: 'Hola Ana, vi que cobran por PSE' },
      { idPasoInscripcion: idPaso2, cuerpo: 'Hola Beto, les ayudo con el recaudo' },
    ],
    horaInicio: '2026-07-27T11:00:00.000Z',
    espaciadoMinutos: 2,
  });

  assert.equal(r.totalProgramados, 2);
  assert.equal(r.totalRechazados, 0);
  assert.equal(r.programados[0].fechaProgramada, '2026-07-27T11:00:00.000Z');
  assert.equal(r.programados[1].fechaProgramada, '2026-07-27T11:02:00.000Z', 'el segundo, dos minutos despues');
  assert.equal(r.programados[0].cuerpoFinal, 'Hola Ana, vi que cobran por PSE');
  assert.ok(r.programados[0].aprobadoEn, 'queda aprobado en el mismo movimiento');
  assert.equal(r.programados[0].aprobadoPor, 'Sebastian Acosta Molina');
  assert.equal(r.programados[0].estado, 'pendiente', 'programar NO lo marca como enviado');
});

// Programar no es "ya lo mande": no puede aparecer un toque en la cuenta a las 8:15 por algo
// que sale a las 11:00 y que todavia podria no salir.
test('programar no escribe ningun toque', () => {
  const db = raw();
  const n = (db.prepare('SELECT count(*) n FROM toque').get() as { n: number }).n;
  db.close();
  assert.equal(n, 0);
});

test('ya aprobado, el paso si sale, y respeta la hora', () => {
  const antes = pasoInscripcionesPendientes('whatsapp', '2026-07-27T10:59:00.000Z');
  assert.equal(antes.length, 0, 'a las 10:59 todavia no');

  const alas11 = pasoInscripcionesPendientes('whatsapp', '2026-07-27T11:00:30.000Z');
  assert.deepEqual(alas11.map((f) => f.idPasoInscripcion), [idPaso1], 'solo el primero: el segundo es a las 11:02');
  assert.equal(alas11[0].paso.cuerpo, 'Hola Ana, vi que cobran por PSE', 'sale el copy revisado, no la plantilla');

  const alas1102 = pasoInscripcionesPendientes('whatsapp', '2026-07-27T11:02:30.000Z');
  assert.equal(alas1102.length, 2);
});

test('envios_programados muestra lo listo y lo que falta por revisar', () => {
  const r = enviosProgramadosTool({ fecha: '2026-07-27', canal: 'whatsapp' });
  assert.equal(r.total, 2);
  assert.equal(r.totalListos, 2);
  assert.equal(r.totalSinAprobar, 0);
  assert.equal(r.envios[0].empresa, 'pr-1');
  assert.equal(r.envios[0].cuerpoFinal, 'Hola Ana, vi que cobran por PSE');
  assert.equal(r.envios[0].listo, true);
});

// Rechazar sin tumbar el lote: seis buenos y uno malo tienen que dejar seis programados.
test('un paso que no existe se rechaza solo, los demas quedan programados', () => {
  const r = programarEnviosTool({
    pasos: [
      { idPasoInscripcion: idPaso1, cuerpo: 'Copy corregido de Ana' },
      { idPasoInscripcion: 999999, cuerpo: 'a un paso que no existe' },
    ],
    horaInicio: '2026-07-27T15:00:00.000Z',
  });

  assert.equal(r.totalProgramados, 1);
  assert.deepEqual(r.rechazados, [{ idPasoInscripcion: 999999, motivo: 'no_existe' }]);
  assert.equal(r.programados[0].cuerpoFinal, 'Copy corregido de Ana');
});

// Reescribir el copy de algo que ya salio seria falsificar el registro de lo que se dijo.
test('un paso que ya salio se rechaza con su motivo', () => {
  marcarPasoInscripcionEnviada(idPaso2, 'evolution', 'msg-x', '2026-07-27T11:02:00.000Z');
  const r = programarEnviosTool({
    pasos: [{ idPasoInscripcion: idPaso2, cuerpo: 'intento tardio' }],
    horaInicio: '2026-07-27T16:00:00.000Z',
  });
  assert.equal(r.totalProgramados, 0);
  assert.deepEqual(r.rechazados, [{ idPasoInscripcion: idPaso2, motivo: 'ya_salio' }]);
});

// El espaciado default es el que el operador pidio, para que no dependa de que lo mande cada vez.
test('sin espaciado explicito, dos minutos', () => {
  const r = programarEnviosTool({
    pasos: [{ idPasoInscripcion: idPaso1, cuerpo: 'x' }],
    horaInicio: '2026-07-27T17:00:00.000Z',
  });
  assert.equal(r.espaciadoMinutos, 2);
  assert.match(r.nota, /120000/, 'la respuesta dice a cuanto hay que poner el espaciado del worker');
});

test('las dos acciones se publican en su lista, escritura y lectura por separado', async () => {
  assert.ok((TOOLS_ESCRITURA as readonly string[]).includes('programar_envios'));
  assert.ok((TOOLS_LECTURA as readonly string[]).includes('envios_programados'));

  const [aCliente, aServidor] = InMemoryTransport.createLinkedPair();
  const server = crearMcpServer();
  const cliente = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(aServidor), cliente.connect(aCliente)]);
  const { tools } = await cliente.listTools();
  const nombres = tools.map((t) => t.name);

  assert.ok(nombres.includes('envios_programados'), 'un lector puede verificar que quedaron listas');
  assert.ok(!nombres.includes('programar_envios'), 'pero no puede programar sin permiso de escritura');
  await cliente.close();
});

// Regresion del canal que NO se pidio cambiar: un paso manual de correo sin aprobar sigue sin
// salir, exactamente como antes. La compuerta de correo es por campana (aprobada_envio_gmail)
// y no se le agrego una segunda.
test('un paso manual de correo sin aprobar sigue sin salir', () => {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal, organizacion_activa_id)
     VALUES ('pr-mail','nit','pr-mail','pr-mail','activo','on_hold','pr-mail-cat',1)`,
  ).run();
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente)
     VALUES ('pr-mail','C',0,1,'pr-mail@e.com','seed')`,
  ).run();
  db.close();

  const idCad = crearCadencia({
    nombre: 'C mail manual',
    pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x', esManual: true }],
  });
  const idSeg = guardarSegmento(
    { nombre: 'pr-mail-seg', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['pr-mail-cat'] }] } },
    1,
  );
  const idCamp = crearCampana({ nombre: 'Camp mail', idCadencia: idCad, idSegmento: idSeg }, 1);
  const dbp = raw();
  dbp.prepare('UPDATE campana SET proveedor_campana_id = ? WHERE id_campana = ?').run('seq-mail', idCamp);
  const pasoMail = dbp.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCad) as { id_paso: number };
  const verMail = dbp.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(pasoMail.id_paso) as { id_version: number };
  dbp.close();
  inscribirCampana(idCamp, 1);

  const id = crearPasoInscripcionPendiente({
    idDestinatario: idDestinatarioDe('pr-mail'),
    idPaso: pasoMail.id_paso,
    idVersion: verMail.id_version,
    canal: 'correo',
    fechaProgramada: '2026-07-01',
  });

  const pendientes = pasoInscripcionesPendientes('correo', '2026-07-27T23:00:00.000Z');
  assert.ok(!pendientes.some((f) => f.idPasoInscripcion === id), 'sigue esperando revision, como siempre');
});
