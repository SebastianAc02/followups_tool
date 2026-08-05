// El contrato del MCP para las cuatro acciones nuevas del cierre de la propuesta: tandas,
// dashboard_cro, marcar_canal y marcar_tarea_bloqueante.
//
// Va por el Client real del SDK y no llamando los wrappers, por lo que ya paso dos veces en esta
// misma rama: el dominio puede saber hacer algo y la tool dejarlo sin camino. El inputSchema de
// registerTool parsea con Zod y bota en silencio las llaves que no declaro.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearMcpServer } = await import('./server.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

test.after(() => borrarDbPrueba(dbPath));

function seedEmpresa(id: string, estado = 'contacto_iniciado', owner: string | null = 'Sebastian Acosta Molina') {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 1, ?)`,
  ).run(id, id, id, estado, owner);
  db.close();
}

async function conectar() {
  const servidor = crearMcpServer({ escritura: true });
  const cliente = new Client({ name: 'prueba-tandas', version: '1.0.0' });
  const [t1, t2] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(t2), cliente.connect(t1)]);
  return cliente;
}

const leer = (res: unknown) => JSON.parse(((res as { content: { text: string }[] }).content)[0].text);

// El cuerpo llega como JSON del protocolo, sin tipos. Se declara lo que estas pruebas leen y nada
// mas: tipar la respuesta entera aca la duplicaria y las dos copias se desincronizarian.
type CuentaEnRespuesta = {
  idEmpresa: string;
  regla: string;
  evidencia: { campo: string };
  advertencias: string[];
  diasEnEstado: number | null;
};

const buscar = (cuerpo: { tandas: { tanda: string; cuentas: CuentaEnRespuesta[] }[] }, id: string) => {
  for (const grupo of cuerpo.tandas) {
    const c = grupo.cuentas.find((x) => x.idEmpresa === id);
    if (c) return { tanda: grupo.tanda, cuenta: c };
  }
  return null;
};

// La prueba central. Sin la evidencia la lista no se puede auditar y hay que rehacerla a mano, que
// es exactamente el problema que la accion viene a resolver.
test('tandas devuelve cada cuenta con la regla que la clasifico y su evidencia', async () => {
  seedEmpresa('t-frio');
  const cliente = await conectar();

  const cuerpo = leer(await cliente.callTool({ name: 'tandas', arguments: {} }));
  const encontrada = buscar(cuerpo, 't-frio');

  assert.ok(encontrada, 'la cuenta tiene que salir en alguna tanda');
  assert.ok(typeof encontrada.cuenta.regla === 'string' && encontrada.cuenta.regla.length > 0);
  assert.ok('campo' in encontrada.cuenta.evidencia);
});

// El fallo del 4-ago en la superficie donde ocurrio. La cuenta entra, pero entra marcada, y el
// conteo de arriba dice de una cuanto de la lista descansa en datos que nadie confirmo.
test('una cuenta sin aliado verificado entra a la lista MARCADA, y el hueco se reporta arriba', async () => {
  const cliente = await conectar();
  const cuerpo = leer(await cliente.callTool({ name: 'tandas', arguments: {} }));
  const encontrada = buscar(cuerpo, 't-frio');

  assert.notEqual(encontrada?.tanda, 'fuera');
  assert.ok(encontrada?.cuenta.advertencias.some((a) => a.includes('aliado')));
  assert.ok(cuerpo.sinVerificarAliado >= 1);
});

test('marcar_aliado saca la cuenta de la lista, y con incluirDescartadas se puede auditar por que', async () => {
  seedEmpresa('t-aliada');
  const cliente = await conectar();

  await cliente.callTool({
    name: 'marcar_aliado',
    arguments: { idEmpresa: 't-aliada', aliado: 'sae_plus', fuente: 'operador', quien: 'Sebastian Acosta Molina' },
  });

  const sinDescartadas = leer(await cliente.callTool({ name: 'tandas', arguments: {} }));
  assert.equal(buscar(sinDescartadas, 't-aliada'), null, 'una cuenta de un aliado no sale en la lista de llamadas');

  const conDescartadas = leer(await cliente.callTool({ name: 'tandas', arguments: { incluirDescartadas: true } }));
  const auditada = buscar(conDescartadas, 't-aliada');
  assert.equal(auditada?.tanda, 'fuera');
  assert.equal(auditada?.cuenta.regla, 'aliado');
});

// Intel Go, de punta a punta: se marca la linea muerta y la cuenta deja de salir a llamar.
test('marcar_canal muerto manda la cuenta a esperar y deja de gastar toques', async () => {
  seedEmpresa('t-intelgo');
  const cliente = await conectar();

  const antes = leer(await cliente.callTool({ name: 'tandas', arguments: {} }));
  assert.notEqual(buscar(antes, 't-intelgo')?.tanda, 'esperar');

  await cliente.callTool({
    name: 'marcar_canal',
    arguments: {
      idEmpresa: 't-intelgo',
      canal: 'llamada',
      estado: 'muerto',
      nota: 'tono de fuera de servicio',
      fuente: 'operador',
      quien: 'Sebastian Acosta Molina',
    },
  });

  const despues = leer(await cliente.callTool({ name: 'tandas', arguments: {} }));
  assert.equal(buscar(despues, 't-intelgo')?.tanda, 'esperar');
});

// Jigartel: la deuda propia se separa de las que no contestan, y la fecha dice cuanto lleva.
test('marcar_tarea_bloqueante separa la deuda propia, y la fecha no se mueve al remarcar', async () => {
  seedEmpresa('t-jigartel');
  const cliente = await conectar();

  const primero = leer(
    await cliente.callTool({
      name: 'marcar_tarea_bloqueante',
      arguments: { idEmpresa: 't-jigartel', tarea: 'conseguir el numero del gerente', quien: 'Sebastian Acosta Molina', desde: '2026-07-22' },
    }),
  );
  assert.equal(primero.bloqueada, true);
  assert.equal(primero.desde, '2026-07-22');
  assert.ok(primero.diasBloqueada > 0);

  // Remarcar la MISMA tarea no reinicia el reloj: si lo reiniciara, una cuenta que lleva tres
  // semanas quieta se veria como nueva cada vez que alguien la vuelve a anotar.
  const segundo = leer(
    await cliente.callTool({
      name: 'marcar_tarea_bloqueante',
      arguments: { idEmpresa: 't-jigartel', tarea: 'conseguir el numero del gerente', quien: 'Sebastian Acosta Molina' },
    }),
  );
  assert.equal(segundo.desde, '2026-07-22', 'la fecha original se conserva');

  const cuerpo = leer(await cliente.callTool({ name: 'tandas', arguments: {} }));
  assert.equal(buscar(cuerpo, 't-jigartel')?.tanda, 'bloqueado_por_tarea');
});

test('el filtro por dueno saca a las cuentas de otro, con su regla', async () => {
  seedEmpresa('t-defelipe', 'contacto_iniciado', 'Felipe Castro');
  const cliente = await conectar();

  const cuerpo = leer(await cliente.callTool({ name: 'tandas', arguments: { owner: 'Sebastian Acosta Molina', incluirDescartadas: true } }));
  assert.equal(buscar(cuerpo, 't-defelipe')?.cuenta.regla, 'otro_dueno');
});

test('dashboard_cro responde los siete bloques y separa los entrantes de WhatsApp', async () => {
  const cliente = await conectar();
  const cuerpo = leer(await cliente.callTool({ name: 'dashboard_cro', arguments: { desde: '2026-07-20', hasta: '2026-08-04' } }));

  for (const bloque of ['costoDeUnaReunion', 'mixPorCanal', 'embudoReuniones', 'mixPorTipo', 'cierresSinMovimiento', 'tasaRespuesta', 'entrantesWhatsapp']) {
    assert.ok(bloque in cuerpo, `falta el bloque ${bloque}`);
  }
  // El mix por tipo tiene que traer su denominador al lado o no se puede leer sin equivocarse.
  assert.ok('toquesSinTipo' in cuerpo.mixPorTipo);
});
