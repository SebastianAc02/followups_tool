// lanzar_campana (escritura, 2026-07-27): la unica tool del MCP que le manda mensajes a gente
// real. Lo que este archivo fija no es que lanzar funcione, es que NO mande cuando no debe:
//   - sin confirmar:true no se escribe una sola fila;
//   - una empresa sin destinatario utilizable BLOQUEA el lanzamiento entero (mas estricto que
//     el boton de la web, que la manda a la cola de revision y sigue: desde el MCP esa cola no
//     se ve, asi que seria una empresa que se da por lanzada y nunca recibe nada);
//   - un canal sin Gmail verificado / sin linea no lanza;
//   - una campana que ya no esta en borrador no se relanza por accidente;
//   - un paso de whatsapp se materializa pero NO sale, y eso se reporta como gate, no como fallo;
//   - un paso que se cayo en el proveedor hace REVENTAR la tool, con el estado releido y el log
//     crudo dentro del error. Un lanzamiento con un envio caido no puede devolverse como exito.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { lanzarCampanaTool } = await import('./tools.ts');
const { crearMcpServer, TOOLS_LECTURA, TOOLS_ESCRITURA } = await import('./server.ts');
const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  materializarPasosDebidos,
  marcarPasoInscripcionEnviada,
  marcarPasoInscripcionFallo,
  estadoLanzamientoCampana,
  pasoInscripcionesPendientes,
} = await import('../db/repository.ts');
const { hoy } = await import('../lib/reloj.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

const USUARIO = 'u-lanza';
const OWNER = 'Sebastian Acosta Molina';
const SESION = { idUsuario: USUARIO, owner: OWNER };

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, ciudad: string, email: string | null, telefono: string | null) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?, 1, ?)`,
  ).run(id, id, id, ciudad, OWNER);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, email, fuente)
     VALUES (?, 'Contacto', 1, 1, ?, ?, 'seed')`,
  ).run(id, telefono, email);
  db.close();
}

// gmailVerificadoDe() = credencial + ultima verificacion 'ok'. Es el gate real de 'correo'.
function seedGmail(idUsuario: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO conector (proveedor, id_usuario, credencial_ciphertext, estado, ultimo_resultado, id_organizacion)
     VALUES ('gmail', ?, 'cifrado-de-mentira', 'activo', 'ok', 1)`,
  ).run(idUsuario);
  db.close();
}

function armarCampana(sufijo: string, canal: 'correo' | 'whatsapp', empresas: { id: string; email: string | null; telefono: string | null }[]) {
  const ciudad = `lz-${sufijo}`;
  for (const e of empresas) seedEmpresa(e.id, ciudad, e.email, e.telefono);
  const idCadencia = crearCadencia({
    nombre: `C ${sufijo}`,
    pasos: [{ orden: 1, diaOffset: 0, canal, asunto: 'Hola', cuerpo: 'Texto de prueba', esManual: false }],
  });
  const idSegmento = guardarSegmento({ nombre: `seg-${sufijo}`, definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: [ciudad] }] } }, 1);
  const idCampana = crearCampana({ nombre: `Camp ${sufijo}`, idCadencia, idSegmento }, 1);
  const db = raw();
  db.prepare(`UPDATE campana SET fecha_inicio = ?, intake_diario = 10 WHERE id_campana = ?`).run(hoy(), idCampana);
  db.close();
  return idCampana;
}

// El push de verdad vive en el worker y habla con Gmail/Evolution. Aca se inyecta: materializa
// igual que el worker (misma funcion del dominio) y despues fuerza el desenlace que cada test
// quiere probar. Sin esto no habria forma de probar el camino del proveedor caido.
function pushFalso(desenlace: 'enviada' | 'fallo' | 'nada') {
  return async () => {
    materializarPasosDebidos(hoy(), { diasBloqueados: [], corrimiento: 'siguiente' });
    if (desenlace === 'nada') return;
    const db = raw();
    const pasos = db.prepare(`SELECT id_paso_inscripcion FROM paso_inscripcion WHERE estado = 'pendiente'`).all() as { id_paso_inscripcion: number }[];
    db.close();
    for (const p of pasos) {
      if (desenlace === 'enviada') {
        marcarPasoInscripcionEnviada(p.id_paso_inscripcion, 'gmail', `msg-${p.id_paso_inscripcion}`, new Date().toISOString());
      } else {
        console.error(`push falló para paso_inscripcion ${p.id_paso_inscripcion}: Gmail devolvió 401 invalid_grant`);
        marcarPasoInscripcionFallo(p.id_paso_inscripcion, 1, null);
      }
    }
  };
}

seedGmail(USUARIO);

test('en seco (default) no escribe NADA y devuelve a quién le llegaría y a qué dirección', async () => {
  const idCampana = armarCampana('seco', 'correo', [{ id: 'lz-seco-1', email: 'prueba@ejemplo.com', telefono: null }]);

  const r = await lanzarCampanaTool({ idCampana }, 1, SESION, { empujarAhora: pushFalso('enviada') });

  assert.equal(r.confirmado, false);
  assert.equal(r.puedeLanzar, true);
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.destinatarios.length, 1);
  assert.equal(r.destinatarios[0].email, 'prueba@ejemplo.com', 'la dirección exacta es lo que hay que poder leer ANTES de mandar');
  assert.deepEqual(r.destinatarios[0].canales, ['correo']);
  assert.equal(r.inscripcion, null);

  const db = raw();
  const camp = db.prepare('SELECT estado, proveedor_campana_id, aprobada_envio_gmail FROM campana WHERE id_campana = ?').get(idCampana) as any;
  const n = (db.prepare('SELECT count(*) n FROM inscripcion WHERE id_campana = ?').get(idCampana) as any).n;
  const pasos = (db.prepare('SELECT count(*) n FROM paso_inscripcion').get() as any).n;
  db.close();
  assert.equal(camp.estado, 'borrador', 'sigue en borrador: en seco no se lanza');
  assert.equal(camp.proveedor_campana_id, null);
  assert.equal(camp.aprobada_envio_gmail, 0);
  assert.equal(n, 0, 'ni una inscripción');
  assert.equal(pasos, 0, 'ni un paso materializado');
});

test('confirmar:true inscribe, deja la campaña lista para Gmail y devuelve el paso RELEÍDO con su proveedor y su id de mensaje', async () => {
  const idCampana = armarCampana('ok', 'correo', [{ id: 'lz-ok-1', email: 'destino@ejemplo.com', telefono: null }]);

  const r = await lanzarCampanaTool({ idCampana, confirmar: true }, 1, SESION, { empujarAhora: pushFalso('enviada') });

  assert.equal(r.confirmado, true);
  assert.deepEqual(r.problemas, []);
  assert.equal(r.inscripcion?.inscritas, 1);
  assert.equal(r.inscripcion?.bloqueadas, 0);

  const estado = r.estadoTrasLanzar!;
  assert.equal(estado.campana.estado, 'activa');
  assert.equal(estado.campana.owner, OWNER, 'la campaña queda a nombre de quien lanzó, no de quien la creó');
  assert.equal(estado.campana.proveedorCampanaId, `gmail-camp-${idCampana}`);
  assert.equal(estado.campana.aprobadaEnvioGmail, true, 'sin esta compuerta el paso se materializa y nunca sale');
  assert.equal(estado.inscripciones.length, 1);
  assert.equal(estado.inscripciones[0].destinatarios[0].email, 'destino@ejemplo.com');
  assert.equal(estado.pasos.length, 1);
  assert.equal(estado.pasos[0].estado, 'enviada');
  assert.equal(estado.pasos[0].proveedor, 'gmail');
  assert.ok(estado.pasos[0].proveedorMensajeId, 'el acuse del proveedor es la prueba de que salió');

  // Lo releido es la base, no el eco del input.
  const relectura = estadoLanzamientoCampana(idCampana, 1)!;
  assert.deepEqual(relectura.pasos[0].proveedorMensajeId, estado.pasos[0].proveedorMensajeId);
});

test('una campaña que ya se lanzó no se relanza: revienta explícito', async () => {
  const idCampana = armarCampana('doble', 'correo', [{ id: 'lz-doble-1', email: 'doble@ejemplo.com', telefono: null }]);
  await lanzarCampanaTool({ idCampana, confirmar: true }, 1, SESION, { empujarAhora: pushFalso('enviada') });

  const seco = await lanzarCampanaTool({ idCampana }, 1, SESION, { empujarAhora: pushFalso('enviada') });
  assert.equal(seco.puedeLanzar, false);
  assert.match(seco.bloqueos.join(' '), /no en 'borrador'/);

  await assert.rejects(
    () => lanzarCampanaTool({ idCampana, confirmar: true }, 1, SESION, { empujarAhora: pushFalso('enviada') }),
    /estado 'activa'/,
  );
});

test('una empresa sin destinatario utilizable bloquea el lanzamiento entero', async () => {
  const idCampana = armarCampana('bloq', 'correo', [
    { id: 'lz-bloq-1', email: 'si@ejemplo.com', telefono: null },
    { id: 'lz-bloq-2', email: null, telefono: null },
  ]);

  const seco = await lanzarCampanaTool({ idCampana }, 1, SESION, { empujarAhora: pushFalso('enviada') });
  assert.equal(seco.puedeLanzar, false);
  assert.equal(seco.bloqueadas.length, 1);
  assert.match(seco.bloqueos.join(' '), /sin destinatario utilizable/);

  await assert.rejects(() => lanzarCampanaTool({ idCampana, confirmar: true }, 1, SESION, { empujarAhora: pushFalso('enviada') }), /sin destinatario utilizable/);

  const db = raw();
  const n = (db.prepare('SELECT count(*) n FROM inscripcion WHERE id_campana = ?').get(idCampana) as any).n;
  db.close();
  assert.equal(n, 0, 'el bloqueo corta ANTES de escribir');
});

test('sin Gmail verificado, una cadencia de correo no lanza', async () => {
  const idCampana = armarCampana('singmail', 'correo', [{ id: 'lz-sg-1', email: 'sg@ejemplo.com', telefono: null }]);
  const sesionSinGmail = { idUsuario: 'u-sin-gmail', owner: 'Otro Vendedor' };

  const seco = await lanzarCampanaTool({ idCampana }, 1, sesionSinGmail, { empujarAhora: pushFalso('enviada') });
  assert.equal(seco.puedeLanzar, false);
  assert.match(seco.bloqueos.join(' '), /canal correo/);

  await assert.rejects(() => lanzarCampanaTool({ idCampana, confirmar: true }, 1, sesionSinGmail, { empujarAhora: pushFalso('enviada') }), /canal correo/);
});

test('un paso que se cayó en el proveedor hace reventar la tool, con el estado releído y el log crudo dentro del error', async () => {
  const idCampana = armarCampana('fallo', 'correo', [{ id: 'lz-fallo-1', email: 'cae@ejemplo.com', telefono: null }]);

  await assert.rejects(
    () => lanzarCampanaTool({ idCampana, confirmar: true }, 1, SESION, { empujarAhora: pushFalso('fallo') }),
    (e: Error) => {
      assert.match(e.message, /no salieron/);
      assert.match(e.message, /quedó en 'fallo'/);
      assert.match(e.message, /invalid_grant/, 'el error crudo del proveedor viaja, no se pierde en un console.error');
      assert.match(e.message, /"confirmado": true/, 'la escritura ya ocurrió: el estado releído viaja dentro del error');
      return true;
    },
  );

  // La inscripcion SI quedo escrita (el fallo fue del envio, no del enrollment): reventar no
  // puede hacer creer que no paso nada.
  const estado = estadoLanzamientoCampana(idCampana, 1)!;
  assert.equal(estado.campana.estado, 'activa');
  assert.equal(estado.pasos[0].estado, 'fallo');
});

test('WhatsApp: el paso se materializa pero NO sale, y se reporta como gate, no como fallo', async () => {
  // Con email ADEMAS del telefono a proposito: elegirDestinatarioDefault (core/inscripcion.ts,
  // B1.b) exige email para elegir destinatario, incluso en una cadencia que solo usa whatsapp.
  // Es regla vieja del dominio y aplica igual en la web; el telefono es el que decide el canal.
  const idCampana = armarCampana('wa', 'whatsapp', [{ id: 'lz-wa-1', email: 'wa@ejemplo.com', telefono: '573001112233' }]);
  const db = raw();
  db.prepare(`INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado) VALUES ('573000000001','personal',?,'wa-lanza','activa')`).run(USUARIO);
  db.close();

  const seco = await lanzarCampanaTool({ idCampana }, 1, SESION, { empujarAhora: pushFalso('nada') });
  assert.equal(seco.puedeLanzar, true, seco.bloqueos.join(' | '));
  assert.match(seco.advertencias.join(' '), /WhatsApp/, 'antes de confirmar ya se avisa que no van a salir solos');

  const r = await lanzarCampanaTool({ idCampana, confirmar: true }, 1, SESION, { empujarAhora: pushFalso('nada') });
  assert.deepEqual(r.problemas, [], 'un WhatsApp sin aprobar no es un fallo: es el gate funcionando');
  assert.equal(r.esperandoRevisionHumana.length, 1);
  assert.equal(r.estadoTrasLanzar!.pasos[0].estado, 'pendiente');
  assert.equal(r.estadoTrasLanzar!.pasos[0].aprobadoEn, null);

  const pendientes = pasoInscripcionesPendientes('whatsapp', new Date(Date.now() + 86_400_000).toISOString());
  assert.equal(pendientes.length, 0, 'ni el worker se lo puede llevar sin que alguien lea el texto');
});

test('el aviso de la ventana horaria viaja SIEMPRE, también en seco', async () => {
  const idCampana = armarCampana('ventana', 'correo', [{ id: 'lz-vent-1', email: 'v@ejemplo.com', telefono: null }]);
  const r = await lanzarCampanaTool({ idCampana }, 1, SESION, { empujarAhora: pushFalso('nada') });
  assert.match(r.advertencias.join(' '), /8:00-18:00/);
});

test('una campaña que no existe revienta en los dos modos', async () => {
  await assert.rejects(() => lanzarCampanaTool({ idCampana: 999_999 }, 1, SESION, { empujarAhora: pushFalso('nada') }), /no existe/);
  await assert.rejects(() => lanzarCampanaTool({ idCampana: 999_999, confirmar: true }, 1, SESION, { empujarAhora: pushFalso('nada') }), /no existe/);
});

// --- registro de la tool en el server -------------------------------------------------

async function toolsDe(server: ReturnType<typeof crearMcpServer>) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(c);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t: { name: string }) => t.name).sort();
}

test('lanzar_campana solo existe con el gate de escritura, y contra la constante publicada', async () => {
  const soloLectura = await toolsDe(crearMcpServer());
  assert.ok(!soloLectura.includes('lanzar_campana'));

  const conEscritura = await toolsDe(crearMcpServer({ escritura: true, idOrganizacion: 1, owner: OWNER, idUsuario: USUARIO }));
  assert.deepEqual(conEscritura, [...TOOLS_LECTURA, ...TOOLS_ESCRITURA].sort());
  assert.ok(conEscritura.includes('lanzar_campana'));
});

// El server standalone por token no tiene sesion de usuario. La tool se registra igual (la
// lista de tools no puede depender de quien pregunta) pero falla explicito: lanzar a nombre de
// nadie seria mandar por la linea de cualquiera.
test('con escritura pero sin sesión de usuario, lanzar_campana falla explícito en vez de lanzar a nombre de nadie', async () => {
  const server = crearMcpServer({ escritura: true, idOrganizacion: 1 });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(c);

  const r = (await client.callTool({ name: 'lanzar_campana', arguments: { idCampana: 1 } })) as { isError?: boolean; content: { text: string }[] };
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /no trae usuario ni owner/);

  await client.close();
});
