// enviar_whatsapp_directo (escritura, 2026-07-28): UN mensaje a UN numero, ya, por el mismo
// camino que probarLineaAction (app/conectores/lineas-whatsapp-actions.ts) -- CanalEntrega.
// enviarPaso directo, sin outbox/paso_inscripcion. Lo que este archivo fija:
//   - resuelve la linea ACTIVA del owner que llama cuando no se pasa instancia;
//   - una instancia explicita tiene que ser DEL owner que llama, o se rechaza;
//   - sin linea activa y sin instancia explicita, se rechaza en vez de mandar por cualquiera;
//   - el resultado es lo que el proveedor (inyectado, sin red real) devolvio RELEIDO
//     (proveedorMensajeId + estadoProveedor), nunca un {ok:true};
//   - un fallo del proveedor hace REVENTAR la tool, no se traga el error.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { enviarWhatsappDirectoTool } = await import('./tools.ts');
const { crearMcpServer, TOOLS_ESCRITURA } = await import('./server.ts');

const USUARIO = 'u-envia';
const OWNER = 'Sebastian Acosta Molina';
const SESION = { idUsuario: USUARIO, owner: OWNER };

// Cada test que le importa el estado de linea_whatsapp usa su PROPIO id_usuario: la tabla
// no se limpia entre tests (misma db de archivo para todo el archivo, patron ya usado en
// tools.lanzar.test.ts/tools.programar.test.ts), asi que compartir usuario entre un test que
// deja una linea activa y uno que prueba "sin linea activa" haria que el segundo viera la del
// primero.
function sesionPropia(sufijo: string) {
  return { idUsuario: `${USUARIO}-${sufijo}`, owner: OWNER };
}

function raw() {
  return new Database(dbPath);
}

function seedLinea(idUsuario: string | null, referenciaProveedor: string, estado: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado, techo_diario)
     VALUES (?, 'personal', ?, ?, ?, 10)`,
  ).run(referenciaProveedor.replace(/\D/g, '') || '000', idUsuario, referenciaProveedor, estado);
  db.close();
}

function depsFalsos(respuesta: { proveedorMensajeId: string; estadoProveedor: string | null } | Error) {
  const llamadas: { referenciaProveedor: string; telefono: string; cuerpo: string; idLinea: number | null }[] = [];
  return {
    deps: {
      enviar: async (referenciaProveedor: string, telefono: string, cuerpo: string, idLinea: number | null) => {
        llamadas.push({ referenciaProveedor, telefono, cuerpo, idLinea });
        if (respuesta instanceof Error) throw respuesta;
        return respuesta;
      },
    },
    llamadas,
  };
}

test('sin instancia explicita, resuelve la linea ACTIVA del owner y devuelve lo que el proveedor confirmo', async () => {
  const sesion = sesionPropia('default');
  seedLinea(sesion.idUsuario, 'wa-12368895214', 'activa');
  const { deps, llamadas } = depsFalsos({ proveedorMensajeId: 'MSG-REAL-1', estadoProveedor: 'PENDING' });

  const r = await enviarWhatsappDirectoTool({ telefono: '+1 (236) 889-5214', cuerpo: 'Prueba de conexión' }, sesion, deps);

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].referenciaProveedor, 'wa-12368895214');
  assert.equal(llamadas[0].telefono, '12368895214', 'el telefono se limpia a solo digitos antes de mandar');

  assert.equal(r.instancia, 'wa-12368895214');
  assert.equal(r.proveedorMensajeId, 'MSG-REAL-1');
  assert.equal(r.estadoProveedor, 'PENDING');
  assert.equal(r.owner, OWNER);
  assert.equal(r.telefono, '12368895214');
  assert.ok(!Number.isNaN(Date.parse(r.enviadoEn)), 'enviadoEn tiene que ser una fecha real, no un eco vacio');
});

test('con instancia explicita DEL owner, manda por esa aunque no sea la unica activa', async () => {
  const sesion = sesionPropia('dos-lineas');
  seedLinea(sesion.idUsuario, 'wa-12368895214', 'activa');
  seedLinea(sesion.idUsuario, 'wa-573105182997', 'activa');
  const { deps, llamadas } = depsFalsos({ proveedorMensajeId: 'MSG-2', estadoProveedor: 'PENDING' });

  const r = await enviarWhatsappDirectoTool({ telefono: '3105182997', cuerpo: 'hola', instancia: 'wa-573105182997' }, sesion, deps);

  assert.equal(llamadas[0].referenciaProveedor, 'wa-573105182997');
  assert.equal(r.instancia, 'wa-573105182997');
});

test('instancia que NO es del owner que llama: se rechaza, no manda por la linea de otro', async () => {
  const sesion = sesionPropia('ajena');
  seedLinea('otro-usuario', 'wa-ajena', 'activa');
  const { deps, llamadas } = depsFalsos({ proveedorMensajeId: 'no-deberia-llamar', estadoProveedor: null });

  await assert.rejects(
    () => enviarWhatsappDirectoTool({ telefono: '123', cuerpo: 'hola', instancia: 'wa-ajena' }, sesion, deps),
    /no es una línea de Sebastian Acosta Molina/,
  );
  assert.equal(llamadas.length, 0, 'no se llama al proveedor si la instancia no es del owner');
});

test('sin linea activa y sin instancia explicita: se rechaza en vez de inventar una', async () => {
  const sesion = sesionPropia('caida');
  seedLinea(sesion.idUsuario, 'wa-caida', 'caida');
  const { deps, llamadas } = depsFalsos({ proveedorMensajeId: 'x', estadoProveedor: null });

  await assert.rejects(
    () => enviarWhatsappDirectoTool({ telefono: '123', cuerpo: 'hola' }, sesion, deps),
    /no tiene una línea de WhatsApp activa/,
  );
  assert.equal(llamadas.length, 0);
});

test('sesion sin owner/idUsuario: se rechaza antes de tocar la DB o el proveedor', async () => {
  const { deps, llamadas } = depsFalsos({ proveedorMensajeId: 'x', estadoProveedor: null });
  await assert.rejects(
    () => enviarWhatsappDirectoTool({ telefono: '123', cuerpo: 'hola' }, { idUsuario: '', owner: '' }, deps),
    /esta sesión no trae usuario ni owner/,
  );
  assert.equal(llamadas.length, 0);
});

test('telefono vacio despues de limpiar y cuerpo vacio: se rechazan sin llamar al proveedor', async () => {
  const sesion = sesionPropia('vacios');
  seedLinea(sesion.idUsuario, 'wa-x', 'activa');
  const { deps } = depsFalsos({ proveedorMensajeId: 'x', estadoProveedor: null });
  await assert.rejects(() => enviarWhatsappDirectoTool({ telefono: '+++', cuerpo: 'hola' }, sesion, deps), /telefono vacío/);
  await assert.rejects(() => enviarWhatsappDirectoTool({ telefono: '123', cuerpo: '   ' }, sesion, deps), /cuerpo vacío/);
});

// Camino de error (regla 5 del MCP: toda accion prueba tambien su fallo): el proveedor
// truena y la tool NO se traga el error ni devuelve un exito a medias.
test('si el proveedor falla, la tool revienta con ese error, no devuelve OK', async () => {
  const sesion = sesionPropia('falla');
  seedLinea(sesion.idUsuario, 'wa-y', 'activa');
  const { deps, llamadas } = depsFalsos(new Error('Evolution respondio 500 en /message/sendText/wa-y: timeout'));

  await assert.rejects(
    () => enviarWhatsappDirectoTool({ telefono: '123', cuerpo: 'hola' }, sesion, deps),
    /Evolution respondio 500/,
  );
  assert.equal(llamadas.length, 1, 'si se intento mandar, no que se haya rechazado antes');
});

test('enviar_whatsapp_directo esta en TOOLS_ESCRITURA y solo se lista con escritura:true', async () => {
  assert.ok(TOOLS_ESCRITURA.includes('enviar_whatsapp_directo' as (typeof TOOLS_ESCRITURA)[number]));

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
  assert.equal(soloLectura.includes('enviar_whatsapp_directo'), false);

  const conEscritura = await nombresDe(crearMcpServer({ escritura: true, idOrganizacion: 1, owner: OWNER, idUsuario: USUARIO }));
  assert.equal(conEscritura.includes('enviar_whatsapp_directo'), true);
});

test.after(() => borrarDbPrueba(dbPath));
