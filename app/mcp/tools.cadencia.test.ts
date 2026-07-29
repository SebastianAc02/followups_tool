// crear_cadencia, el gate de correo muerto de cambiar_cadencia, y tracking_correo
// (2026-07-28). Lo que este archivo fija:
//
//   - crear_cadencia escribe las tres/cuatro filas (segmento, cadencia, pasos, campana) en UNA
//     transaccion y devuelve lo que quedo EN LA BASE, releido, no el eco del input.
//   - un input invalido no deja NADA a medias: ni cadencia huerfana, ni segmento suelto. Es el
//     motivo entero por el que es una tool y no dos.
//   - cambiar_cadencia YA NO produce correos que mueren callados: si la campana tiene pasos de
//     correo que no pueden salir, falla y no inscribe. Ese era el bug -- el descarte vive en
//     agruparPendientesCorreo como un `continue` pelado, sin error, sin marcar la fila fallo, y
//     la fila se quedaba 'pendiente' para siempre.
//   - armarEnvioCorreo:true lo desbloquea escribiendo el par (proveedor_campana_id,
//     aprobada_envio_gmail) y eso se comprueba LEYENDO la fila de campana, no confiando en el
//     valor de retorno.
//   - agruparPendientesCorreo avisa por cada fila que descarta, en vez de saltarla en silencio.
//   - tracking_correo devuelve el evento crudo con su huella y marca los posibles duplicados
//     sin filtrarlos.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadenciaTool, trackingCorreoTool, cambiarCadenciaTool } = await import('./tools.ts');
const { TOOLS_LECTURA, TOOLS_ESCRITURA } = await import('./server.ts');
const { estadoEnvioCorreo, campanaCompleta, materializarPasosDebidos, pasoInscripcionesPendientes, idUsuarioDeOwner, gmailVerificadoDe } = await import(
  '../db/repository.ts'
);
const { agruparPendientesCorreo } = await import('../adapters/registro-envio.ts');

// El día contra el que se materializa, tomado del MISMO reloj que escribe inscripcion.
// fecha_inscripcion (new Date().toISOString(), o sea UTC), no de hoy() (que es Bogotá).
//
// No es cosmética: materializarPasosDebidos compara el anchor (fecha_inscripcion, UTC) contra
// el `hoy` que le pasa el worker (hoy(), Bogotá). Entre las 19:00 y las 24:00 de Bogotá esas
// dos fechas son días distintos, así que una inscripción hecha esa noche tiene su anchor en
// "mañana" y su paso de diaOffset 0 NO se materializa hasta el día siguiente. Usar hoy() acá
// haría que estos tests pasaran u fallaran según la hora a la que se corran, que es la peor
// clase de test. El desfase en sí queda reportado como bug aparte: es del materializador, no
// de las tools.
function diaDelAnclaje(): string {
  return new Date().toISOString().slice(0, 10);
}

const USUARIO = 'u-cad';
const OWNER = 'Sebastian Acosta Molina';
const SESION = { idUsuario: USUARIO, owner: OWNER };

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, ciudad: string, email: string | null) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'activo', 'lead', ?, 1, ?)`,
  ).run(id, id, id, ciudad, OWNER);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, email, fuente)
     VALUES (?, 'Contacto', 1, 1, '3001234567', ?, 'seed')`,
  ).run(id, email);
  db.close();
}

// gmailVerificadoDe() = credencial + ultimo_resultado 'ok'. Es el gate real de 'correo', y sin
// esto el owner cae al fallback de Apollo y el bug que se prueba abajo no se dispara.
function seedGmail(idUsuario: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO conector (proveedor, id_usuario, credencial_ciphertext, estado, ultimo_resultado, id_organizacion)
     VALUES ('gmail', ?, 'cifrado-de-mentira', 'activo', 'ok', 1)`,
  ).run(idUsuario);
  db.close();
}

// idUsuarioDeOwner mapea owner -> usuario por organizacion_miembro. Sin la fila, el owner no
// resuelve a nadie y el correo tambien cae a Apollo.
function seedMiembro(idUsuario: string, owner: string) {
  const db = raw();
  db.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, ?, ?, ?)`).run(owner, owner, idUsuario);
  db.close();
}

seedGmail(USUARIO);
seedMiembro(USUARIO, OWNER);

const CADENCIA_5_CORREOS = {
  nombre: 'Cadencia de 5 correos',
  descripcion: 'La que el operador quiere dejar corriendo sola',
  pasos: [
    { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola [nombre]', cuerpo: 'Primer correo' },
    { orden: 2, diaOffset: 3, canal: 'correo', asunto: 'Seguimiento', cuerpo: 'Segundo correo' },
    { orden: 3, diaOffset: 7, canal: 'correo', asunto: 'Tercero', cuerpo: 'Tercer correo' },
    { orden: 4, diaOffset: 12, canal: 'correo', asunto: 'Cuarto', cuerpo: 'Cuarto correo' },
    { orden: 5, diaOffset: 18, canal: 'correo', asunto: 'Último', cuerpo: 'Quinto correo' },
  ],
};

// --- crear_cadencia -------------------------------------------------------------------

test('crear_cadencia deja las 4 filas escritas y las devuelve RELEIDAS de la base', () => {
  seedEmpresa('cc-1', 'ciudad-crear', 'uno@ejemplo.com');

  const r = crearCadenciaTool(
    {
      ...CADENCIA_5_CORREOS,
      segmento: { nombre: 'seg-crear', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-crear'] }] } },
    },
    1,
    SESION,
  );

  // Lo devuelto tiene que coincidir con lo que hay en la base, leido por fuera del repositorio.
  const db = raw();
  const camp = db.prepare(`SELECT * FROM campana WHERE id_campana = ?`).get(r.idCampana) as Record<string, unknown>;
  const pasos = db.prepare(`SELECT canal, orden, dia_offset, es_manual FROM paso_cadencia WHERE id_cadencia = ? ORDER BY orden`).all(r.idCadencia);
  const versiones = db
    .prepare(`SELECT vp.asunto, vp.cuerpo FROM version_paso vp JOIN paso_cadencia pc ON pc.id_paso = vp.id_paso WHERE pc.id_cadencia = ? ORDER BY pc.orden`)
    .all(r.idCadencia) as { asunto: string; cuerpo: string }[];
  const seg = db.prepare(`SELECT nombre, id_organizacion FROM segmento WHERE id_segmento = ?`).get(r.idSegmento) as Record<string, unknown>;
  db.close();

  assert.equal(camp.id_cadencia, r.idCadencia);
  assert.equal(camp.id_segmento, r.idSegmento);
  assert.equal(camp.estado, 'borrador', 'crear no es lanzar: nace en borrador');
  assert.equal(camp.owner, OWNER, 'el owner sale de la sesión, no del input');
  assert.equal(camp.id_organizacion, 1);
  assert.equal(seg.id_organizacion, 1);
  assert.equal(pasos.length, 5);
  assert.equal(versiones.length, 5, 'cada paso nace con su version_paso default, que es donde vive el copy');
  assert.equal(versiones[0].cuerpo, 'Primer correo');
  assert.equal(versiones[4].asunto, 'Último');

  // Y lo RELEIDO que devuelve la tool coincide con esa misma base.
  assert.equal(r.campana.campana.estado, 'borrador');
  assert.equal(r.campana.pasos.length, 5);
  assert.deepEqual(r.campana.pasos.map((p) => p.orden), [1, 2, 3, 4, 5]);
  assert.equal(r.campana.pasos[0].cuerpo, 'Primer correo');
  assert.equal(r.campana.segmento.empresasQueCaen, 1, 'el segmento se corre de verdad, no se devuelve la definición sola');
  assert.deepEqual(r.campana.pasos[0].variables, ['nombre'], 'las variables del copy se extraen al persistir');
});

test('crear_cadencia deja los pasos de correo automáticos: es la diferencia entre correr sola y no', () => {
  seedEmpresa('cc-auto', 'ciudad-auto', 'auto@ejemplo.com');

  const r = crearCadenciaTool(
    { ...CADENCIA_5_CORREOS, segmento: { nombre: 'seg-auto', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-auto'] }] } } },
    1,
    SESION,
  );

  assert.ok(
    r.campana.pasos.every((p) => p.esManual === false),
    'un paso de correo sin esManual explícito queda automático: con es_manual=1 cada envío exigiría aprobación humana',
  );
  assert.equal(r.advertencias.filter((a) => a.includes('esManual')).length, 0);
});

test('crear_cadencia AVISA cuando un paso de correo quedó manual: esa cadencia ya no corre sola', () => {
  seedEmpresa('cc-man', 'ciudad-man', 'man@ejemplo.com');

  const r = crearCadenciaTool(
    {
      nombre: 'Con un paso manual',
      pasos: [
        { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'A', cuerpo: 'uno', esManual: true },
        { orden: 2, diaOffset: 3, canal: 'correo', asunto: 'B', cuerpo: 'dos' },
      ],
      segmento: { nombre: 'seg-man', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-man'] }] } },
    },
    1,
    SESION,
  );

  assert.equal(r.campana.pasos[0].esManual, true);
  assert.equal(r.campana.pasos[1].esManual, false);
  assert.ok(
    r.advertencias.some((a) => a.includes('esManual=true') && a.includes('programar_envios')),
    'la advertencia tiene que nombrar el gate concreto, no decir "revisar"',
  );
});

// El gate de WhatsApp NO vive en paso_cadencia.es_manual: whatsapp está en CANALES_AUTOMATICOS
// (tiene proveedor, Evolution), así que un paso de whatsapp queda es_manual=0 igual que uno de
// correo. Lo que impide que salga es otra cosa, una capa más abajo:
// pasoInscripcionesPendientes exige aprobado_en NOT NULL para el canal whatsapp, sin importar
// es_manual. Este test fija esa distinción, porque leer es_manual=0 y concluir "el whatsapp
// sale solo" es el error fácil.
test('crear_cadencia: llamada queda manual siempre; whatsapp queda es_manual=0 pero su gate está en otra capa', () => {
  seedEmpresa('cc-wa', 'ciudad-wa', 'wa@ejemplo.com');

  const r = crearCadenciaTool(
    {
      nombre: 'Multicanal',
      pasos: [
        { orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'hola', esManual: false },
        { orden: 2, diaOffset: 1, canal: 'llamada', objetivo: 'agendar', esManual: false },
        { orden: 3, diaOffset: 2, canal: 'correo', asunto: 'A', cuerpo: 'texto', esManual: false },
      ],
      segmento: { nombre: 'seg-wa', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-wa'] }] } },
    },
    1,
    SESION,
  );

  assert.equal(r.campana.pasos[0].esManual, false, 'whatsapp está en CANALES_AUTOMATICOS: su gate NO es es_manual');
  assert.equal(r.campana.pasos[1].esManual, true, 'llamada no tiene proveedor automático, se autocorrige a manual');
  assert.equal(r.campana.pasos[2].esManual, false, 'correo sí sale solo');
  assert.ok(
    r.advertencias.some((a) => a.includes('WhatsApp') && a.includes('revisión humana')),
    'la advertencia es lo único que dice que el whatsapp no sale solo, porque es_manual=0 sugiere lo contrario',
  );
});

// --- crear_cadencia: los caminos de error ---------------------------------------------

test('crear_cadencia sin owner en la sesión NO escribe: una campaña sin owner manda por Apollo, no por el Gmail de nadie', () => {
  const antes = raw();
  const n0 = (antes.prepare(`SELECT count(*) n FROM cadencia`).get() as { n: number }).n;
  antes.close();

  assert.throws(
    () =>
      crearCadenciaTool(
        { ...CADENCIA_5_CORREOS, segmento: { nombre: 'seg-noowner', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['x'] }] } } },
        1,
        { idUsuario: USUARIO, owner: '   ' },
      ),
    /owner/,
  );

  const db = raw();
  const n1 = (db.prepare(`SELECT count(*) n FROM cadencia`).get() as { n: number }).n;
  db.close();
  assert.equal(n1, n0, 'no se escribió ni una cadencia');
});

test('crear_cadencia con un segmento SIN condiciones no escribe nada: matchearía la base entera', () => {
  const antes = raw();
  const cad0 = (antes.prepare(`SELECT count(*) n FROM cadencia`).get() as { n: number }).n;
  const seg0 = (antes.prepare(`SELECT count(*) n FROM segmento`).get() as { n: number }).n;
  antes.close();

  assert.throws(
    () => crearCadenciaTool({ ...CADENCIA_5_CORREOS, segmento: { nombre: 'seg-vacio', definicion: { condiciones: [] } } }, 1, SESION),
    /condicion/,
  );

  const db = raw();
  const cad1 = (db.prepare(`SELECT count(*) n FROM cadencia`).get() as { n: number }).n;
  const seg1 = (db.prepare(`SELECT count(*) n FROM segmento`).get() as { n: number }).n;
  db.close();
  assert.equal(cad1, cad0, 'ni cadencia huérfana');
  assert.equal(seg1, seg0, 'ni segmento suelto');
});

test('crear_cadencia sin ningún paso no escribe nada', () => {
  const antes = raw();
  const seg0 = (antes.prepare(`SELECT count(*) n FROM segmento`).get() as { n: number }).n;
  antes.close();

  assert.throws(() =>
    crearCadenciaTool(
      { nombre: 'Vacía', pasos: [], segmento: { nombre: 'seg-sinpasos', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['x'] }] } } },
      1,
      SESION,
    ),
  );

  const db = raw();
  const seg1 = (db.prepare(`SELECT count(*) n FROM segmento`).get() as { n: number }).n;
  db.close();
  assert.equal(seg1, seg0, 'el segmento tampoco quedó: la transacción cubre las cuatro filas o ninguna');
});

test('crear_cadencia con un segmento de OTRA organización no escribe nada', () => {
  seedEmpresa('cc-org', 'ciudad-org', 'org@ejemplo.com');
  const base = crearCadenciaTool(
    { ...CADENCIA_5_CORREOS, segmento: { nombre: 'seg-org', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-org'] }] } } },
    1,
    SESION,
  );

  const antes = raw();
  const n0 = (antes.prepare(`SELECT count(*) n FROM cadencia`).get() as { n: number }).n;
  antes.close();

  assert.throws(() => crearCadenciaTool({ ...CADENCIA_5_CORREOS, idSegmento: base.idSegmento }, 2, SESION), /no existe en la organizacion 2/);

  const db = raw();
  const n1 = (db.prepare(`SELECT count(*) n FROM cadencia`).get() as { n: number }).n;
  db.close();
  assert.equal(n1, n0);
});

test('crear_cadencia exige segmento: idSegmento o segmento, ni los dos ni ninguno', () => {
  assert.throws(() => crearCadenciaTool({ ...CADENCIA_5_CORREOS }, 1, SESION), /idSegmento.*segmento|segmento/);
  assert.throws(
    () =>
      crearCadenciaTool(
        { ...CADENCIA_5_CORREOS, idSegmento: 1, segmento: { nombre: 'x', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['y'] }] } } },
        1,
        SESION,
      ),
    /los dos/,
  );
});

// --- el bug: inscribir producía correos que morían callados ---------------------------

test('cambiar_cadencia NO inscribe en una campaña cuyo correo no puede salir, y dice cuál compuerta está cerrada', () => {
  seedEmpresa('cc-bug', 'ciudad-bug', 'bug@ejemplo.com');
  const r = crearCadenciaTool(
    { ...CADENCIA_5_CORREOS, segmento: { nombre: 'seg-bug', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-bug'] }] } } },
    1,
    SESION,
  );

  // Estado de partida: recién creada, las dos compuertas de campaña cerradas.
  const previo = estadoEnvioCorreo(r.idCampana, 1);
  assert.equal(previo?.proveedorCampanaId, null);
  assert.equal(previo?.aprobadaEnvioGmail, false);
  assert.equal(previo?.proveedorQueMandaria, 'gmail', 'el owner resuelve a un Gmail verificado: el gate de aprobación aplica');
  assert.equal(previo?.saldra, false);

  assert.throws(
    () => cambiarCadenciaTool({ idEmpresa: 'cc-bug', idCampana: r.idCampana }, 1),
    /proveedor_campana_id|aprobada_envio_gmail/,
    'el error tiene que nombrar la columna concreta, no decir "no se puede"',
  );

  // Y no se inscribió a nadie: el punto entero es que fallar es mejor que inscribir muerto.
  const db = raw();
  const n = (db.prepare(`SELECT count(*) n FROM inscripcion WHERE id_campana = ?`).get(r.idCampana) as { n: number }).n;
  db.close();
  assert.equal(n, 0);
});

test('cambiar_cadencia con armarEnvioCorreo:true inscribe Y deja el correo listo, comprobado leyendo la fila de campana', () => {
  seedEmpresa('cc-armar', 'ciudad-armar', 'armar@ejemplo.com');
  const r = crearCadenciaTool(
    { ...CADENCIA_5_CORREOS, segmento: { nombre: 'seg-armar', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-armar'] }] } } },
    1,
    SESION,
  );

  const res = cambiarCadenciaTool({ idEmpresa: 'cc-armar', idCampana: r.idCampana, armarEnvioCorreo: true }, 1);

  assert.equal(res.inscripcion?.ok, true);
  assert.equal(res.inscripcion?.estado, 'activa');
  assert.equal(res.envioCorreo?.saldra, true, 'el diagnóstico releído dice que ahora sí sale');
  assert.deepEqual(res.envioCorreo?.bloqueos, []);

  // La comprobación que importa: la fila de campana en la base, no el valor de retorno.
  const db = raw();
  const camp = db.prepare(`SELECT proveedor_campana_id, aprobada_envio_gmail, estado FROM campana WHERE id_campana = ?`).get(r.idCampana) as {
    proveedor_campana_id: string;
    aprobada_envio_gmail: number;
    estado: string;
  };
  const insc = db.prepare(`SELECT count(*) n FROM inscripcion WHERE id_campana = ? AND estado = 'activa'`).get(r.idCampana) as { n: number };
  db.close();

  assert.equal(camp.proveedor_campana_id, `gmail-camp-${r.idCampana}`);
  assert.equal(camp.aprobada_envio_gmail, 1);
  assert.equal(camp.estado, 'activa', 'inscribir la pasa a activa');
  assert.equal(insc.n, 1);
});

test('el correo de una campaña armada SÍ llega a la cola de envío; el de una sin armar se descarta con aviso, no en silencio', () => {
  seedEmpresa('cc-cola', 'ciudad-cola', 'cola@ejemplo.com');
  const r = crearCadenciaTool(
    {
      nombre: 'Un solo correo hoy',
      pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hoy', cuerpo: 'sale hoy' }],
      segmento: { nombre: 'seg-cola', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-cola'] }] } },
    },
    1,
    SESION,
  );
  cambiarCadenciaTool({ idEmpresa: 'cc-cola', idCampana: r.idCampana, armarEnvioCorreo: true }, 1);
  materializarPasosDebidos(diaDelAnclaje(), { diasBloqueados: [], corrimiento: 'siguiente' });

  // agruparPendientesCorreo es GLOBAL (barre todas las campañas activas), así que se cuenta
  // solo lo de esta empresa: si no, los pasos que dejaron los tests de arriba se cuelan.
  const deEstaEmpresa = (grupos: { filas: { destinatario: { empresa: string | null } }[] }[]) =>
    grupos.reduce((n, g) => n + g.filas.filter((f) => f.destinatario.empresa === 'cc-cola').length, 0);

  // Armada: la fila llega a un grupo de envío de verdad.
  assert.equal(deEstaEmpresa(agruparPendientesCorreo(new Date().toISOString())), 1, 'con la campaña armada el paso de correo entra a la cola');

  // Ahora se apaga la compuerta a mano y se comprueba que el descarte AVISA.
  const db = raw();
  db.prepare(`UPDATE campana SET aprobada_envio_gmail = 0 WHERE id_campana = ?`).run(r.idCampana);
  db.close();

  // Se reusan las deps REALES (mismo gate, mismos datos): lo único que se intercepta es el
  // aviso. Falsear el gate probaría el mock, no el descarte.
  const avisos: string[] = [];
  const gruposTrasApagar = agruparPendientesCorreo(new Date().toISOString(), {
    pendientes: (ahora) => pasoInscripcionesPendientes('correo', ahora),
    idUsuarioDeOwner,
    gmailVerificado: gmailVerificadoDe,
    crearGmail: () => ({ enviarPaso: async () => ({ proveedor: 'gmail', proveedorMensajeId: 'x', proveedorHiloId: null }) }) as never,
    crearApollo: () => ({ enviarPaso: async () => ({ proveedor: 'apollo', proveedorMensajeId: 'x', proveedorHiloId: null }) }) as never,
    onDescartada: (fila, motivo) => {
      if (fila.destinatario.empresa === 'cc-cola') avisos.push(motivo);
    },
  });

  assert.equal(deEstaEmpresa(gruposTrasApagar), 0, 'sin aprobar, la fila no sale');
  assert.equal(avisos.length, 1, 'y el descarte deja rastro: era un `continue` pelado, sin error y sin log');
  assert.ok(avisos[0].includes('aprobada_envio_gmail'), 'el aviso nombra la columna, no dice "no se pudo"');
});

test('cambiar_cadencia sin pasos de correo pasa derecho: el gate solo aplica a correo', () => {
  seedEmpresa('cc-wa2', 'ciudad-wa2', null);
  const r = crearCadenciaTool(
    {
      nombre: 'Solo llamadas',
      pasos: [{ orden: 1, diaOffset: 0, canal: 'llamada', objetivo: 'presentar' }],
      segmento: { nombre: 'seg-wa2', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-wa2'] }] } },
    },
    1,
    SESION,
  );

  const res = cambiarCadenciaTool({ idEmpresa: 'cc-wa2', idCampana: r.idCampana }, 1);
  assert.equal(res.inscripcion?.ok, true);
  assert.equal(res.envioCorreo?.tieneCorreo, false);
  assert.deepEqual(res.envioCorreo?.bloqueos, [], 'una cadencia sin correo no tiene bloqueos de correo que reportar');
});

test('cambiar_cadencia contra una campaña que no existe falla explícito y no toca la empresa', () => {
  seedEmpresa('cc-nada', 'ciudad-nada', 'nada@ejemplo.com');
  assert.throws(() => cambiarCadenciaTool({ idEmpresa: 'cc-nada', idCampana: 999999 }, 1), /no existe en la organizacion/);
});

// --- tracking_correo ------------------------------------------------------------------

test('tracking_correo devuelve el evento con su empresa, su campaña y su huella cruda', () => {
  seedEmpresa('cc-track', 'ciudad-track', 'track@ejemplo.com');
  const r = crearCadenciaTool(
    {
      nombre: 'Para trackear',
      pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Asunto trackeado', cuerpo: 'cuerpo' }],
      segmento: { nombre: 'seg-track', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-track'] }] } },
    },
    1,
    SESION,
  );
  cambiarCadenciaTool({ idEmpresa: 'cc-track', idCampana: r.idCampana, armarEnvioCorreo: true }, 1);
  materializarPasosDebidos(diaDelAnclaje(), { diasBloqueados: [], corrimiento: 'siguiente' });

  const db = raw();
  const paso = db
    .prepare(
      `SELECT pi.id_paso_inscripcion FROM paso_inscripcion pi
       JOIN destinatario d ON d.id_destinatario = pi.id_destinatario
       JOIN inscripcion i ON i.id_inscripcion = d.id_inscripcion
       WHERE i.id_campana = ?`,
    )
    .get(r.idCampana) as { id_paso_inscripcion: number };
  const ins = db.prepare(
    `INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, detalle, fecha_evento, created_at)
     VALUES (?, ?, 'correo', ?, ?, ?, ?)`,
  );
  // La clave real que escribe huella-request.ts es 'ua' (huella-request.ts:56), literal. Antes
  // este seed usaba 'user_agent', que coincidía con el nombre que buscaba el bug de lectura de
  // repository.ts:7416 y por eso el test pasaba con la lectura rota -- sembrar la clave que el
  // productor real escribe es lo que hace que este test detecte la regresión si el bug vuelve.
  ins.run(paso.id_paso_inscripcion, 'abierto', 'ev-1', JSON.stringify({ via: 'pixel', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', ip: '181.1.1.1' }), '2026-07-28T10:00:00.000Z', '2026-07-28T10:00:00.000Z');
  // Dos hits a 3 segundos: el caso real que hoy cuenta doble porque no hay deduplicación.
  ins.run(paso.id_paso_inscripcion, 'abierto', 'ev-2', JSON.stringify({ via: 'pixel', ua: 'Mozilla/5.0 (via GoogleImageProxy)', ip: '66.102.1.1' }), '2026-07-28T10:00:03.000Z', '2026-07-28T10:00:03.000Z');
  ins.run(paso.id_paso_inscripcion, 'clic', 'ev-3', JSON.stringify({ via: 'link', url: 'https://onepay.co' }), '2026-07-28T11:00:00.000Z', '2026-07-28T11:00:00.000Z');
  // Un evento viejo, de antes de que se capturara la huella: userAgent tiene que quedar null.
  ins.run(paso.id_paso_inscripcion, 'abierto', 'ev-viejo', JSON.stringify({ via: 'pixel' }), '2026-07-01T10:00:00.000Z', '2026-07-01T10:00:00.000Z');
  db.close();

  const r1 = trackingCorreoTool({ idEmpresa: 'cc-track' }, 1);

  assert.equal(r1.total, 4);
  assert.deepEqual(r1.porTipo, { abierto: 3, clic: 1 });
  assert.equal(r1.eventos[0].empresa, 'cc-track');
  assert.equal(r1.eventos[0].idCampana, r.idCampana);
  assert.equal(r1.eventos[0].email, 'track@ejemplo.com');
  assert.equal(r1.eventos[0].asunto, 'Asunto trackeado');
  assert.equal(r1.eventos[0].pasoOrden, 1);

  const abiertoConUa = r1.eventos.find((e) => e.proveedorEventoId === 'ev-1')!;
  assert.equal(
    abiertoConUa.userAgent,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  );
  assert.equal(abiertoConUa.ip, '181.1.1.1');
  assert.equal(abiertoConUa.via, 'pixel');
  // UA de navegador completo real: R7 lo clasifica humano.
  assert.equal(abiertoConUa.clasificacion, 'humano');
  assert.equal(abiertoConUa.razon, 'ua_navegador_completo');

  const proxyGmail = r1.eventos.find((e) => e.proveedorEventoId === 'ev-2')!;
  assert.equal(proxyGmail.clasificacion, 'maquina');
  assert.equal(proxyGmail.razon, 'proxy_imagenes_gmail');

  const viejo = r1.eventos.find((e) => e.proveedorEventoId === 'ev-viejo')!;
  assert.equal(viejo.userAgent, null, 'null porque no se capturó, no porque vino vacío');
  assert.equal(viejo.clasificacion, 'desconocido');
  assert.equal(viejo.razon, 'sin_huella_capturada');
  assert.equal(r1.conHuella, 2);
  assert.equal(r1.sinHuella, 2);

  const clic = r1.eventos.find((e) => e.tipo === 'clic')!;
  assert.equal(clic.url, 'https://onepay.co');

  // Los duplicados se MARCAN, no se filtran: deduplicar es una decisión que nadie tomó.
  assert.equal(r1.posiblesDuplicados.length, 1);
  assert.equal(r1.posiblesDuplicados[0].tipo, 'abierto');
  assert.equal(r1.posiblesDuplicados[0].segundos, 3);
  // ev-1 y ev-2 están a 3s, por encima de la ventana formal de dedup (2000ms): cada uno es su
  // propio grupo. La heurística de posiblesDuplicados (10s) los marca igual, más ancha a propósito.
  assert.equal(abiertoConUa.esRepresentanteGrupo, true);
  assert.equal(proxyGmail.esRepresentanteGrupo, true);
  assert.equal(r1.conteos.crudo.total, 4);
  assert.equal(r1.conteos.deduplicado.total, 4);
  assert.ok(r1.advertencias.some((a) => a.includes('Deduplicado') && a.includes('grupoDedupId')));
  assert.ok(r1.advertencias.some((a) => a.includes('pasoOrden')), 'la atribución corrida viaja con el dato, no aparte');
});

test('tracking_correo filtra por tipo, por campaña y por rango de fechas', () => {
  const porTipo = trackingCorreoTool({ idEmpresa: 'cc-track', tipo: 'clic' }, 1);
  assert.equal(porTipo.total, 1);
  assert.equal(porTipo.eventos[0].tipo, 'clic');

  const porFecha = trackingCorreoTool({ idEmpresa: 'cc-track', desde: '2026-07-28', hasta: '2026-07-28T23:59:59Z' }, 1);
  assert.equal(porFecha.total, 3, 'el evento del 1 de julio queda fuera');

  const otraOrg = trackingCorreoTool({ idEmpresa: 'cc-track' }, 2);
  assert.equal(otraOrg.total, 0, 'la organización filtra: no se ve el tracking de otra');

  const otraCampana = trackingCorreoTool({ idCampana: 999999 }, 1);
  assert.equal(otraCampana.total, 0);
});

test('tracking_correo con un detalle ilegible no revienta: devuelve el crudo y los campos en null', () => {
  seedEmpresa('cc-json', 'ciudad-json', 'json@ejemplo.com');
  const r = crearCadenciaTool(
    {
      nombre: 'JSON roto',
      pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'A', cuerpo: 'b' }],
      segmento: { nombre: 'seg-json', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['ciudad-json'] }] } },
    },
    1,
    SESION,
  );
  cambiarCadenciaTool({ idEmpresa: 'cc-json', idCampana: r.idCampana, armarEnvioCorreo: true }, 1);
  materializarPasosDebidos(diaDelAnclaje(), { diasBloqueados: [], corrimiento: 'siguiente' });

  const db = raw();
  const paso = db
    .prepare(
      `SELECT pi.id_paso_inscripcion FROM paso_inscripcion pi
       JOIN destinatario d ON d.id_destinatario = pi.id_destinatario
       JOIN inscripcion i ON i.id_inscripcion = d.id_inscripcion
       WHERE i.id_campana = ?`,
    )
    .get(r.idCampana) as { id_paso_inscripcion: number };
  db.prepare(
    `INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, detalle, fecha_evento, created_at)
     VALUES (?, 'abierto', 'correo', 'ev-roto', '{no es json', '2026-07-28T12:00:00.000Z', '2026-07-28T12:00:00.000Z')`,
  ).run(paso.id_paso_inscripcion);
  db.close();

  const res = trackingCorreoTool({ idEmpresa: 'cc-json' }, 1);
  assert.equal(res.total, 1);
  assert.equal(res.eventos[0].userAgent, null);
  assert.equal(res.eventos[0].via, null);
  assert.equal(res.eventos[0].detalle, '{no es json', 'el crudo viaja igual: es lo único con lo que se puede diagnosticar');
});

// --- el contrato de nombres -----------------------------------------------------------

test('los nombres nuevos están en las constantes que server.test.ts compara contra tools/list', () => {
  assert.ok(TOOLS_ESCRITURA.includes('crear_cadencia'));
  assert.ok(TOOLS_LECTURA.includes('tracking_correo'));
  assert.ok(TOOLS_ESCRITURA.includes('cambiar_cadencia'), 'cambiar_cadencia sigue siendo escritura tras ganar armarEnvioCorreo');
  // El cast existe porque TOOLS_LECTURA es un union de literales y TS rechaza comparar contra
  // un nombre que no está en él. Justamente por eso vale la pena la aserción en runtime: si
  // alguien mueve crear_cadencia a lectura, esto revienta.
  assert.ok(!(TOOLS_LECTURA as readonly string[]).includes('crear_cadencia'), 'crear_cadencia escribe producción: nunca puede colarse como lectura');
});

test('campanaCompleta de una campaña que no existe devuelve null, no una campaña inventada', () => {
  assert.equal(campanaCompleta(999999, 1), null);
  assert.equal(estadoEnvioCorreo(999999, 1), null);
});
