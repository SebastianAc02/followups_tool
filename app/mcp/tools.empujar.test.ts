// empujar_envios (escritura, 2026-07-28). Lo que este archivo fija no es que empujar funcione,
// es que empuje SÓLO lo que se le apuntó y que no mienta sobre lo que no sale:
//   - reproduce el bug que la tool cierra: inscribir por cambiar_cadencia pone la campaña en
//     'activa' y con eso lanzar_campana la rechaza para siempre;
//   - sin confirmar no se escribe ni se manda una sola fila;
//   - una campaña 'activa' SÍ se puede empujar, que es el punto entero;
//   - apuntar a una empresa no arrastra a la otra de la misma campaña (colateral cero), y lo que
//     queda afuera se dice antes en noIncluidos;
//   - un paso programado para mañana no sale, y el motivo dice que adelantar:true lo arregla;
//   - adelantar:true materializa el paso día 0 que el calendario todavía no dio por debido, que
//     es exactamente el caso de la campaña 58 en producción;
//   - el gate de revisión humana de WhatsApp NO se salta;
//   - un paso caído en el proveedor hace REVENTAR la tool, con el estado releído adentro.
// Todo se verifica contra una conexión abierta aparte, no contra el valor de retorno.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { empujarEnviosTool, lanzarCampanaTool } = await import('./tools.ts');
const { crearMcpServer, TOOLS_LECTURA, TOOLS_ESCRITURA } = await import('./server.ts');
const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  cambiarCadencia,
  marcarPasoInscripcionEnviada,
  marcarPasoInscripcionFallo,
  adelantarEnvios,
  candidatosEmpujon,
} = await import('../db/repository.ts');
const { hoy } = await import('../lib/reloj.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

const USUARIO = 'u-empuja';
const OWNER = 'Sebastian Acosta Molina';

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

function seedGmail(idUsuario: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO conector (proveedor, id_usuario, credencial_ciphertext, estado, ultimo_resultado, id_organizacion)
     VALUES ('gmail', ?, 'cifrado-de-mentira', 'activo', 'ok', 1)`,
  ).run(idUsuario);
  // El puente owner -> usuario, que es por donde idUsuarioDeOwner decide si el correo sale por
  // el Gmail de alguien o cae a Apollo. Sin esta fila la campaña manda por Apollo y el gate de
  // aprobada_envio_gmail ni siquiera aplica.
  db.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, ?, ?, ?)`).run(OWNER, OWNER, idUsuario);
  db.close();
}

// Una campaña con su cadencia y su segmento, en 'borrador' y sin nadie inscrito. Las empresas se
// meten después una por una con cambiarCadencia, que es el camino que dispara el bug.
function armarCampana(sufijo: string, canal: 'correo' | 'whatsapp', empresas: { id: string; email: string | null; telefono: string | null }[]) {
  const ciudad = `emp-${sufijo}`;
  for (const e of empresas) seedEmpresa(e.id, ciudad, e.email, e.telefono);
  const idCadencia = crearCadencia({
    nombre: `C ${sufijo}`,
    pasos: [{ orden: 1, diaOffset: 0, canal, asunto: 'Hola', cuerpo: 'Texto de prueba', esManual: false }],
  });
  const idSegmento = guardarSegmento({ nombre: `seg-${sufijo}`, definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: [ciudad] }] } }, 1);
  const idCampana = crearCampana({ nombre: `Camp ${sufijo}`, idCadencia, idSegmento, owner: OWNER }, 1);
  const db = raw();
  db.prepare(`UPDATE campana SET fecha_inicio = ?, intake_diario = 10 WHERE id_campana = ?`).run(hoy(), idCampana);
  db.close();
  return idCampana;
}

// El push real habla con Gmail/Evolution. Acá se inyecta y sólo toca los ids que le llegan: si la
// tool le pasara de más, se vería como un envío que no se pidió.
function pushFalso(desenlace: 'enviada' | 'fallo') {
  const vistos: number[][] = [];
  const fn = async (ids: number[]) => {
    vistos.push([...ids]);
    for (const id of ids) {
      if (desenlace === 'enviada') marcarPasoInscripcionEnviada(id, 'gmail', `msg-${id}`, new Date().toISOString());
      else {
        console.error(`push falló para paso_inscripcion ${id}: Gmail devolvió 401 invalid_grant`);
        marcarPasoInscripcionFallo(id, 1, null);
      }
    }
  };
  return { empujar: fn, vistos };
}

function filaPaso(id: number) {
  const db = raw();
  const f = db.prepare('SELECT estado, proveedor, proveedor_mensaje_id, fecha_programada, proximo_intento FROM paso_inscripcion WHERE id_paso_inscripcion = ?').get(id) as any;
  db.close();
  return f;
}

function contarPasos() {
  const db = raw();
  const n = (db.prepare('SELECT count(*) n FROM paso_inscripcion').get() as any).n;
  db.close();
  return n;
}

seedGmail(USUARIO);

test('el bug que esto cierra: inscribir una empresa pone la campaña en activa y lanzar_campana ya no la toma', async () => {
  const idCampana = armarCampana('bug', 'correo', [{ id: 'emp-bug-1', email: 'bug@ejemplo.com', telefono: null }]);

  const r = cambiarCadencia({ idEmpresa: 'emp-bug-1', idCampana, armarEnvioCorreo: true }, 1);
  assert.equal(r.inscripcion?.ok, true);

  const db = raw();
  const estado = (db.prepare('SELECT estado FROM campana WHERE id_campana = ?').get(idCampana) as any).estado;
  db.close();
  assert.equal(estado, 'activa', 'inscribir una sola empresa ya saca la campaña de borrador');

  // El aviso que antes no existía: quien inscribe se entera EN ESA MISMA llamada de que cerró
  // la puerta, y de cuál es la otra.
  assert.match(r.advertencias.join(' '), /empujar_envios/);
  assert.match(r.advertencias.join(' '), /lanzar_campana ya NO la toma/);

  // Y el rechazo de lanzar_campana ahora dice a dónde ir, en vez de ser un callejón sin salida.
  const seco = await lanzarCampanaTool({ idCampana }, 1, { idUsuario: USUARIO, owner: OWNER }, { empujarAhora: async () => {} });
  assert.equal(seco.puedeLanzar, false);
  assert.match(seco.bloqueos.join(' '), /empujar_envios/);
});

test('sin confirmar no se escribe ni se manda una sola fila, y cada paso trae por qué sale o no', async () => {
  const idCampana = armarCampana('seco', 'correo', [{ id: 'emp-seco-1', email: 'seco@ejemplo.com', telefono: null }]);
  cambiarCadencia({ idEmpresa: 'emp-seco-1', idCampana, armarEnvioCorreo: true }, 1);
  const antes = contarPasos();
  const push = pushFalso('enviada');

  const r = await empujarEnviosTool({ idCampana }, 1, push);

  assert.equal(r.confirmado, false);
  assert.equal(push.vistos.length, 0, 'en seco no se llama al proveedor ni una vez');
  assert.equal(contarPasos(), antes, 'ni una fila nueva');
  assert.equal(r.inscripciones.length, 1);
  assert.equal(r.inscripciones[0].pasosVivos, 0);
  // El caso de producción: hay gente inscrita y CERO pasos materializados. El seco tiene que
  // decirlo, porque "pasos vacío" leído solo se confunde con "no hay nada que empujar".
  assert.match(r.advertencias.join(' '), /no tienen ningún paso vivo materializado/);
  assert.match(r.advertencias.join(' '), /adelantar: true/);
  assert.match(r.advertencias.join(' '), /8:00-18:00/);
});

test('adelantar:true materializa el paso que el calendario todavía no dio por debido, y sale', async () => {
  const idCampana = armarCampana('adel', 'correo', [{ id: 'emp-adel-1', email: 'adel@ejemplo.com', telefono: null }]);
  cambiarCadencia({ idEmpresa: 'emp-adel-1', idCampana, armarEnvioCorreo: true }, 1);
  // Ancla en el futuro: es literalmente lo que pasa en producción cuando se inscribe después de
  // las 19:00 Bogotá (fecha_inscripcion se guarda en UTC y el materializador compara contra el
  // día de Bogotá). Sin adelantar, ese paso no existe hoy y no hay nada que empujar.
  const db = raw();
  const manana = new Date(Date.now() + 86_400_000).toISOString();
  db.prepare('UPDATE inscripcion SET fecha_inscripcion = ? WHERE id_campana = ?').run(manana, idCampana);
  db.close();

  const push = pushFalso('enviada');
  const r = await empujarEnviosTool({ idCampana, adelantar: true, confirmar: true }, 1, push);

  assert.equal(r.confirmado, true);
  assert.deepEqual(r.problemas, []);
  assert.equal(r.adelanto?.adelantados.length, 1);
  assert.equal(r.adelanto?.adelantados[0].accion, 'materializado');
  assert.equal(r.salieron.length, 1);
  assert.equal(r.salieron[0].proveedorMensajeId, `msg-${r.salieron[0].idPasoInscripcion}`);

  // Contra la base, no contra el retorno.
  const fila = filaPaso(r.salieron[0].idPasoInscripcion);
  assert.equal(fila.estado, 'enviada');
  assert.equal(fila.proveedor, 'gmail');
  assert.ok(fila.proveedor_mensaje_id);
});

test('un paso ya materializado pero programado para mañana: no sale, y el motivo dice qué lo arregla', async () => {
  const idCampana = armarCampana('prog', 'correo', [{ id: 'emp-prog-1', email: 'prog@ejemplo.com', telefono: null }]);
  cambiarCadencia({ idEmpresa: 'emp-prog-1', idCampana, armarEnvioCorreo: true }, 1);
  const { adelantados } = adelantarEnvios({ idCampana }, 1);
  const idPaso = adelantados[0].idPasoInscripcion;
  const db = raw();
  db.prepare('UPDATE paso_inscripcion SET fecha_programada = ? WHERE id_paso_inscripcion = ?').run(new Date(Date.now() + 86_400_000).toISOString(), idPaso);
  db.close();

  const push = pushFalso('enviada');
  const seco = await empujarEnviosTool({ idCampana }, 1, push);
  assert.equal(seco.saldrian, 0);
  assert.equal(seco.pasos.length, 1);
  assert.equal(seco.pasos[0].saldra, false);
  assert.match(seco.pasos[0].motivos.join(' '), /todavía no llegó/);
  assert.match(seco.pasos[0].motivos.join(' '), /adelantar: true/);

  // Y confirmando SIN adelantar, no se manda nada: el default no fuerza el calendario.
  const sinAdelanto = await empujarEnviosTool({ idCampana, confirmar: true }, 1, push);
  assert.equal(push.vistos.length, 0);
  assert.equal(sinAdelanto.salieron.length, 0);
  assert.equal(filaPaso(idPaso).estado, 'pendiente');

  // Con adelantar sí, y la fila queda reprogramada (no duplicada).
  const conAdelanto = await empujarEnviosTool({ idCampana, adelantar: true, confirmar: true }, 1, push);
  assert.equal(conAdelanto.adelanto?.adelantados[0].accion, 'reprogramado');
  assert.equal(conAdelanto.adelanto?.adelantados[0].idPasoInscripcion, idPaso);
  assert.equal(filaPaso(idPaso).estado, 'enviada');
});

test('apuntar a una empresa no arrastra a la otra de la misma campaña, y lo que queda afuera se canta antes', async () => {
  const idCampana = armarCampana('mira', 'correo', [
    { id: 'emp-mira-1', email: 'uno@ejemplo.com', telefono: null },
    { id: 'emp-mira-2', email: 'dos@ejemplo.com', telefono: null },
  ]);
  cambiarCadencia({ idEmpresa: 'emp-mira-1', idCampana, armarEnvioCorreo: true }, 1);
  cambiarCadencia({ idEmpresa: 'emp-mira-2', idCampana, armarEnvioCorreo: true }, 1);
  adelantarEnvios({ idCampana }, 1);

  const idsDe = (idEmpresa: string) => candidatosEmpujon({ idsEmpresa: [idEmpresa] }, 1).map((c) => c.idPasoInscripcion);
  const idUno = idsDe('emp-mira-1')[0];
  const idDos = idsDe('emp-mira-2')[0];

  const push = pushFalso('enviada');
  const seco = await empujarEnviosTool({ idsEmpresa: ['emp-mira-1'] }, 1, push);
  assert.equal(seco.pasos.length, 1);
  assert.equal(seco.pasos[0].idPasoInscripcion, idUno);
  assert.ok(
    seco.noIncluidos.some((n) => n.idPasoInscripcion === idDos),
    'lo que otro empujón sacaría y éste no, se dice ANTES de confirmar',
  );

  const r = await empujarEnviosTool({ idsEmpresa: ['emp-mira-1'], confirmar: true }, 1, push);
  assert.deepEqual(push.vistos, [[idUno]], 'al proveedor sólo le llegó el id apuntado');
  assert.equal(r.salieron.length, 1);
  assert.equal(filaPaso(idUno).estado, 'enviada');
  assert.equal(filaPaso(idDos).estado, 'pendiente', 'la otra cuenta de la MISMA campaña no se tocó');
});

test('el gate de revisión humana de WhatsApp no se salta ni confirmando', async () => {
  const idCampana = armarCampana('wa', 'whatsapp', [{ id: 'emp-wa-1', email: 'wa@ejemplo.com', telefono: '573001112233' }]);
  const db = raw();
  db.prepare(`INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado) VALUES ('573000000009','personal',?,'wa-empuja','activa')`).run(USUARIO);
  db.close();
  cambiarCadencia({ idEmpresa: 'emp-wa-1', idCampana }, 1);
  const { adelantados } = adelantarEnvios({ idCampana }, 1);
  const idPaso = adelantados[0].idPasoInscripcion;

  const push = pushFalso('enviada');
  const r = await empujarEnviosTool({ idCampana, adelantar: true, confirmar: true }, 1, push);

  assert.equal(push.vistos.length, 0, 'un WhatsApp sin aprobar no llega al proveedor por más que se empuje');
  assert.equal(r.esperandoRevisionHumana.length, 1);
  assert.match(r.esperandoRevisionHumana[0].motivo, /revisión humana/);
  assert.deepEqual(r.problemas, [], 'el gate funcionando no es un fallo');
  assert.equal(filaPaso(idPaso).estado, 'pendiente');
});

test('un paso que se cayó en el proveedor hace reventar la tool, con el log crudo y el estado releído', async () => {
  const idCampana = armarCampana('cae', 'correo', [{ id: 'emp-cae-1', email: 'cae@ejemplo.com', telefono: null }]);
  cambiarCadencia({ idEmpresa: 'emp-cae-1', idCampana, armarEnvioCorreo: true }, 1);

  await assert.rejects(
    () => empujarEnviosTool({ idCampana, adelantar: true, confirmar: true }, 1, pushFalso('fallo')),
    (e: Error) => {
      assert.match(e.message, /no salieron/);
      assert.match(e.message, /quedó en 'fallo'/);
      assert.match(e.message, /invalid_grant/, 'el error crudo del proveedor viaja, no se pierde en un console.error');
      assert.match(e.message, /"confirmado": true/, 'la escritura ya ocurrió: el estado releído viaja dentro del error');
      return true;
    },
  );

  const cand = candidatosEmpujon({ idCampana }, 1);
  assert.equal(cand[0].estadoPaso, 'fallo');
});

test('sin blanco no se empuja: no existe un modo "todo lo pendiente"', async () => {
  await assert.rejects(() => empujarEnviosTool({}, 1, pushFalso('enviada')), /hace falta decir QUÉ se empuja/);
});

test('un blanco que no alcanza a nadie se distingue de "no hay nada pendiente"', async () => {
  await assert.rejects(() => empujarEnviosTool({ idCampana: 999_999 }, 1, pushFalso('enviada')), /no hay nadie inscrito ahí/);
});

test('adelantar mueve UN paso por inscripción, nunca la cadencia entera', async () => {
  const ciudad = 'emp-uno';
  seedEmpresa('emp-uno-1', ciudad, 'uno@ejemplo.com', null);
  const idCadencia = crearCadencia({
    nombre: 'C tres pasos',
    pasos: [
      { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'A', cuerpo: 'a', esManual: false },
      { orden: 2, diaOffset: 3, canal: 'correo', asunto: 'B', cuerpo: 'b', esManual: false },
      { orden: 3, diaOffset: 7, canal: 'correo', asunto: 'C', cuerpo: 'c', esManual: false },
    ],
  });
  const idSegmento = guardarSegmento({ nombre: 'seg-uno', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: [ciudad] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp uno', idCadencia, idSegmento, owner: OWNER }, 1);
  cambiarCadencia({ idEmpresa: 'emp-uno-1', idCampana, armarEnvioCorreo: true }, 1);

  const primero = adelantarEnvios({ idCampana }, 1);
  assert.equal(primero.adelantados.length, 1, 'una cadencia de 3 pasos adelanta UNO, no los tres');
  assert.equal(primero.adelantados[0].orden, 1);

  // Con el paso 1 vivo (pendiente), volver a adelantar no crea el 2: sigue siendo el mismo.
  const segundo = adelantarEnvios({ idCampana }, 1);
  assert.equal(segundo.adelantados.length, 0);
  assert.match(segundo.saltados[0].motivo, /ya estaba vencido/);

  const db = raw();
  const n = (db.prepare('SELECT count(*) n FROM paso_inscripcion pi JOIN destinatario d ON d.id_destinatario = pi.id_destinatario JOIN inscripcion i ON i.id_inscripcion = d.id_inscripcion WHERE i.id_campana = ?').get(idCampana) as any).n;
  db.close();
  assert.equal(n, 1, 'anti-ráfaga: sigue habiendo una sola fila');
});

test('adelantar no toca una campaña que no está activa: lo reporta saltado en vez de forzarla', async () => {
  const idCampana = armarCampana('pausa', 'correo', [{ id: 'emp-pausa-1', email: 'p@ejemplo.com', telefono: null }]);
  cambiarCadencia({ idEmpresa: 'emp-pausa-1', idCampana, armarEnvioCorreo: true }, 1);
  const db = raw();
  db.prepare(`UPDATE campana SET estado = 'pausada' WHERE id_campana = ?`).run(idCampana);
  db.close();

  const r = adelantarEnvios({ idCampana }, 1);
  assert.equal(r.adelantados.length, 0);
  assert.match(r.saltados[0].motivo, /está en 'pausada'/);
  assert.equal(contarPasosDe(idCampana), 0, 'no se materializó nada para una campaña pausada');
});

function contarPasosDe(idCampana: number) {
  const db = raw();
  const n = (db.prepare('SELECT count(*) n FROM paso_inscripcion pi JOIN destinatario d ON d.id_destinatario = pi.id_destinatario JOIN inscripcion i ON i.id_inscripcion = d.id_inscripcion WHERE i.id_campana = ?').get(idCampana) as any).n;
  db.close();
  return n;
}

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

test('empujar_envios solo existe con el gate de escritura, y contra la constante publicada', async () => {
  const soloLectura = await toolsDe(crearMcpServer());
  assert.ok(!soloLectura.includes('empujar_envios'));

  const conEscritura = await toolsDe(crearMcpServer({ escritura: true, idOrganizacion: 1, owner: OWNER, idUsuario: USUARIO }));
  assert.deepEqual(conEscritura, [...TOOLS_LECTURA, ...TOOLS_ESCRITURA].sort());
  assert.ok(conEscritura.includes('empujar_envios'));
});
