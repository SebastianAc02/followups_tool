// enviar_correo_directo (escritura, 2026-09-01): UN correo a UNA cuenta, YA, sin cadencia ni
// campaña armada a mano -- simétrico a enviar_whatsapp_directo en el gesto, pero NO en el
// mecanismo: acá SÍ queda una fila real de paso_inscripcion (con su campaña/segmento/inscripción
// de un solo uso) porque el pixel de apertura necesita ese enganche para que tracking_correo lo
// pueda leer después. Lo que este archivo fija:
//   - en seco por default: sin confirmar:true no escribe nada en ninguna tabla;
//   - con bloqueos (empresa inexistente, email inválido, sin Gmail conectado) tampoco escribe,
//     aunque venga confirmar:true;
//   - al confirmar, deja cadencia+paso+versión+segmento+campaña+inscripción+destinatario+
//     contacto+paso_inscripcion reales, y el paso_inscripcion queda 'enviada' con el
//     proveedor_mensaje_id/hilo que el proveedor (inyectado, sin red real) devolvió;
//   - el texto plano del cuerpo se convierte a HTML antes de mandar;
//   - un contacto ya existente con ese email se reusa, uno nuevo se crea;
//   - si el proveedor falla DESPUÉS de que el andamiaje ya se escribió, el paso queda 'fallo'
//     (no 'enviada') y el error lo dice explícito con los ids, no se traga nada;
//   - enviar_correo_directo está en TOOLS_ESCRITURA y solo se lista con escritura:true.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { enviarCorreoDirectoTool } = await import('./tools.ts');
const { crearMcpServer, TOOLS_ESCRITURA } = await import('./server.ts');

const ORG = 1;
const OWNER = 'Sebastian Acosta Molina';
const USUARIO = 'u-correo-directo';
const SESION = { idUsuario: USUARIO, owner: OWNER };

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, nombre: string, organizacion = ORG) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'lead', ?)`,
  ).run(id, nombre, nombre.toLowerCase(), organizacion);
  db.close();
}

function seedContacto(idEmpresa: string, email: string) {
  const db = raw();
  const ins = db.prepare(`INSERT INTO contacto (id_empresa, email, fuente, es_principal, es_key_decision_maker) VALUES (?, ?, 'manual', 0, 0)`).run(idEmpresa, email);
  db.close();
  return Number(ins.lastInsertRowid);
}

function depsFalsas(respuesta: { mensajeId: string; hiloId?: string } | Error, remitente: string | null = 'sebastian@onepay.la') {
  const llamadas: { idUsuario: string; destinatarios: string[]; cc: string[]; asunto: string; cuerpoHtml: string; proveedorCampanaId: string }[] = [];
  return {
    deps: {
      remitente: async () => remitente,
      enviar: async (idUsuario: string, destinatarios: string[], cc: string[], asunto: string, cuerpoHtml: string, proveedorCampanaId: string) => {
        llamadas.push({ idUsuario, destinatarios, cc, asunto, cuerpoHtml, proveedorCampanaId });
        if (respuesta instanceof Error) throw respuesta;
        return { mensajeId: respuesta.mensajeId, hiloId: respuesta.hiloId };
      },
    },
    llamadas,
  };
}

test('en seco (sin confirmar): no escribe nada, previsualiza destinatario/asunto/cuerpo en HTML y el remitente resuelto', async () => {
  seedEmpresa('e-correo-1', 'Ruralink SAS');
  const { deps, llamadas } = depsFalsas({ mensajeId: 'no-deberia-llamar' });

  const r = await enviarCorreoDirectoTool(
    { idEmpresa: 'e-correo-1', destinatarios: ['gerencia@ruralink.com.co'], cc: ['felipe@onepay.la'], asunto: 'Integración OnePay', cuerpo: 'Hola.\n\nGracias.' },
    ORG,
    SESION,
    deps,
  );

  assert.equal(r.confirmado, false);
  assert.equal(r.envio, null);
  assert.equal(r.bloqueos.length, 0);
  assert.equal(r.empresaNombre, 'Ruralink SAS');
  assert.equal(r.remitente, 'sebastian@onepay.la');
  assert.equal(r.cuerpoHtml, '<p>Hola.</p><p>Gracias.</p>');
  assert.equal(llamadas.length, 0, 'en seco no llama al proveedor');

  const db = raw();
  const campanas = db.prepare('SELECT count(*) as n FROM campana').get() as { n: number };
  assert.equal(campanas.n, 0, 'en seco no crea ninguna campana');
  db.close();
});

test('empresa inexistente: bloqueo explícito, no escribe aunque venga confirmar:true', async () => {
  const { deps, llamadas } = depsFalsas({ mensajeId: 'no-deberia-llamar' });
  const r = await enviarCorreoDirectoTool(
    { idEmpresa: 'no-existe-xyz', destinatarios: ['a@b.com'], asunto: 'x', cuerpo: 'x', confirmar: true },
    ORG,
    SESION,
    deps,
  );
  assert.equal(r.confirmado, false);
  assert.ok(r.bloqueos.some((b) => b.includes('no existe')));
  assert.equal(llamadas.length, 0);
});

test('sin Gmail conectado: bloqueo explícito, no manda', async () => {
  seedEmpresa('e-correo-2', 'Sin Gmail SAS');
  const { deps, llamadas } = depsFalsas({ mensajeId: 'no-deberia-llamar' }, null);
  const r = await enviarCorreoDirectoTool(
    { idEmpresa: 'e-correo-2', destinatarios: ['a@b.com'], asunto: 'x', cuerpo: 'x', confirmar: true },
    ORG,
    SESION,
    deps,
  );
  assert.equal(r.confirmado, false);
  assert.ok(r.bloqueos.some((b) => b.includes('Gmail conectado')));
  assert.equal(llamadas.length, 0);
});

test('email inválido: bloqueo explícito, no manda', async () => {
  seedEmpresa('e-correo-3', 'Email Malo SAS');
  const { deps, llamadas } = depsFalsas({ mensajeId: 'no-deberia-llamar' });
  const r = await enviarCorreoDirectoTool(
    { idEmpresa: 'e-correo-3', destinatarios: ['no-es-un-email'], asunto: 'x', cuerpo: 'x', confirmar: true },
    ORG,
    SESION,
    deps,
  );
  assert.equal(r.confirmado, false);
  assert.ok(r.bloqueos.some((b) => b.includes('no-es-un-email')));
  assert.equal(llamadas.length, 0);
});

test('confirmado: crea el andamiaje mínimo, manda de verdad y devuelve RELEÍDO estado enviada', async () => {
  seedEmpresa('e-correo-4', 'Confirmada SAS');
  const { deps, llamadas } = depsFalsas({ mensajeId: 'MSG-REAL-1', hiloId: 'THREAD-1' });

  const r = await enviarCorreoDirectoTool(
    {
      idEmpresa: 'e-correo-4',
      destinatarios: ['gerencia@confirmada.com'],
      cc: ['felipe@onepay.la'],
      asunto: 'Integración OnePay Confirmada',
      cuerpo: 'Línea 1\nLínea 2\n\n- Miércoles 2\n- Jueves 3',
      confirmar: true,
    },
    ORG,
    SESION,
    deps,
  );

  assert.equal(r.confirmado, true);
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].destinatarios, ['gerencia@confirmada.com']);
  assert.deepEqual(llamadas[0].cc, ['felipe@onepay.la']);
  assert.equal(llamadas[0].proveedorCampanaId, r.envio!.proveedorCampanaId);
  assert.match(r.envio!.proveedorCampanaId, /^gmail-directo-\d+$/);

  assert.equal(r.envio!.estado, 'enviada');
  assert.equal(r.envio!.proveedor, 'gmail');
  assert.equal(r.envio!.proveedorMensajeId, 'MSG-REAL-1');
  assert.equal(r.envio!.proveedorHiloId, 'THREAD-1');
  assert.equal(r.envio!.fechaEnviada != null, true);
  assert.equal(r.envio!.contactoCreado, true);

  // Releído directo de la base, no confiando en lo que la tool devuelve (mismo criterio que
  // tools.empresas.test.ts).
  const db = raw();
  const paso = db
    .prepare(
      `SELECT pi.estado, pi.proveedor, pi.proveedor_mensaje_id, pi.proveedor_hilo_id, c.proveedor_campana_id, c.estado as campana_estado
       FROM paso_inscripcion pi
       JOIN destinatario d ON d.id_destinatario = pi.id_destinatario
       JOIN inscripcion i ON i.id_inscripcion = d.id_inscripcion
       JOIN campana c ON c.id_campana = i.id_campana
       WHERE pi.id_paso_inscripcion = ?`,
    )
    .get(r.envio!.idPasoInscripcion) as { estado: string; proveedor: string; proveedor_mensaje_id: string; proveedor_hilo_id: string; proveedor_campana_id: string; campana_estado: string };
  assert.equal(paso.estado, 'enviada');
  assert.equal(paso.proveedor, 'gmail');
  assert.equal(paso.proveedor_mensaje_id, 'MSG-REAL-1');
  assert.equal(paso.proveedor_hilo_id, 'THREAD-1');
  assert.equal(paso.proveedor_campana_id, r.envio!.proveedorCampanaId);
  assert.equal(paso.campana_estado, 'activa');

  const contacto = db.prepare(`SELECT email, fuente FROM contacto WHERE id_contacto = ?`).get(r.envio!.idContacto) as { email: string; fuente: string };
  assert.equal(contacto.email, 'gerencia@confirmada.com');
  assert.equal(contacto.fuente, 'mcp_correo_directo');

  const toque = db.prepare(`SELECT id_empresa, canal, fuente FROM toque WHERE id_empresa = ?`).get('e-correo-4') as { id_empresa: string; canal: string; fuente: string } | undefined;
  assert.ok(toque, 'el envío confirmado deja un toque en el historial de la empresa');
  assert.equal(toque!.canal, 'correo');
  db.close();
});

test('contacto ya existente con ese email: se reusa, no se crea uno nuevo', async () => {
  seedEmpresa('e-correo-5', 'Contacto Existente SAS');
  const idContactoExistente = seedContacto('e-correo-5', 'ya-existe@x.com');
  const { deps } = depsFalsas({ mensajeId: 'MSG-2' });

  const r = await enviarCorreoDirectoTool(
    { idEmpresa: 'e-correo-5', destinatarios: ['ya-existe@x.com'], asunto: 'x', cuerpo: 'x', confirmar: true },
    ORG,
    SESION,
    deps,
  );

  assert.equal(r.confirmado, true);
  assert.equal(r.envio!.contactoCreado, false);
  assert.equal(r.envio!.idContacto, idContactoExistente);

  const db = raw();
  const n = db.prepare(`SELECT count(*) as n FROM contacto WHERE id_empresa = ?`).get('e-correo-5') as { n: number };
  assert.equal(n.n, 1, 'no se duplicó el contacto');
  db.close();
});

// Camino de error (regla del MCP: toda acción de escritura prueba también su fallo): el
// andamiaje ya quedó escrito (el pixel necesita el proveedorCampanaId ANTES de mandar), pero
// Gmail rechaza -- el paso queda 'fallo', no 'enviada', y el error no se traga.
test('si el proveedor falla después de crear el andamiaje, el paso queda "fallo" y el error lo dice explícito', async () => {
  seedEmpresa('e-correo-6', 'Falla SAS');
  const { deps, llamadas } = depsFalsas(new Error('Gmail respondio 500 al mandar: timeout'));

  await assert.rejects(
    () =>
      enviarCorreoDirectoTool(
        { idEmpresa: 'e-correo-6', destinatarios: ['a@falla.com'], asunto: 'x', cuerpo: 'x', confirmar: true },
        ORG,
        SESION,
        deps,
      ),
    /Gmail rechazó el envío[\s\S]*Gmail respondio 500/,
  );
  assert.equal(llamadas.length, 1);

  const db = raw();
  const paso = db
    .prepare(
      `SELECT pi.estado FROM paso_inscripcion pi
       JOIN destinatario d ON d.id_destinatario = pi.id_destinatario
       JOIN inscripcion i ON i.id_inscripcion = d.id_inscripcion
       WHERE i.id_empresa = ?`,
    )
    .get('e-correo-6') as { estado: string };
  assert.equal(paso.estado, 'fallo');
  db.close();
});

test('sesion sin owner/idUsuario: se rechaza antes de tocar la DB o el proveedor', async () => {
  seedEmpresa('e-correo-7', 'Sin Sesion SAS');
  const { deps, llamadas } = depsFalsas({ mensajeId: 'no-deberia-llamar' });
  await assert.rejects(
    () =>
      enviarCorreoDirectoTool(
        { idEmpresa: 'e-correo-7', destinatarios: ['a@b.com'], asunto: 'x', cuerpo: 'x', confirmar: true },
        ORG,
        { idUsuario: '', owner: '' },
        deps,
      ),
    /esta sesión no trae usuario ni owner/,
  );
  assert.equal(llamadas.length, 0);
});

test('enviar_correo_directo está en TOOLS_ESCRITURA y solo se lista con escritura:true', async () => {
  assert.ok(TOOLS_ESCRITURA.includes('enviar_correo_directo' as (typeof TOOLS_ESCRITURA)[number]));

  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

  async function nombresDe(server: ReturnType<typeof crearMcpServer>) {
    const [c, s] = InMemoryTransport.createLinkedPair();
    await server.connect(s);
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(c);
    const { tools } = await client.listTools();
    await client.close();
    return tools.map((t) => t.name);
  }

  const soloLectura = await nombresDe(crearMcpServer());
  assert.equal(soloLectura.includes('enviar_correo_directo'), false);

  const conEscritura = await nombresDe(crearMcpServer({ escritura: true, idOrganizacion: 1, owner: OWNER, idUsuario: USUARIO }));
  assert.equal(conEscritura.includes('enviar_correo_directo'), true);
});

test.after(() => borrarDbPrueba(dbPath));
