import test from 'node:test';
import assert from 'node:assert/strict';
import { pushPendientes, calcularProximoIntentoPush, MAX_INTENTOS, type FilaPasoInscripcion, type PushDeps } from './push.ts';
import type { CanalEntrega } from './ports/envio.ts';

type FilaSimulada = FilaPasoInscripcion & {
  estado: 'pendiente' | 'enviando' | 'enviada' | 'fallo';
  proveedorRegistrado?: string;
};

// Deps falsos que se comportan como la query real: pendientes() solo devuelve filas
// en 'pendiente'/'fallo' (una fila 'enviada' desaparece de la lista, igual que la
// query SQL real filtra por estado). Esto es lo que hace posible probar "reanuda
// SOLO los que faltan" sin necesitar SQLite de verdad.
function depsFalsos(filasIniciales: FilaSimulada[]) {
  const filas = new Map(filasIniciales.map((f) => [f.idPasoInscripcion, f]));
  const enviandoLlamado: number[] = [];

  const deps: PushDeps = {
    pendientes: () => [...filas.values()].filter((f) => f.estado === 'pendiente' || f.estado === 'fallo'),
    marcarEnviando: (id) => {
      enviandoLlamado.push(id);
      const f = filas.get(id)!;
      filas.set(id, { ...f, estado: 'enviando' });
    },
    marcarEnviada: (id, proveedor) => {
      const f = filas.get(id)!;
      filas.set(id, { ...f, estado: 'enviada', proveedorRegistrado: proveedor });
    },
    marcarFallo: (id, intentos) => {
      const f = filas.get(id)!;
      filas.set(id, { ...f, estado: 'fallo', intentos });
    },
  };
  return { deps, filas, enviandoLlamado };
}

function envioFalso(comportamiento: (destinatario: { email: string | null }) => boolean): CanalEntrega & { llamadas: string[] } {
  const llamadas: string[] = [];
  return {
    llamadas,
    async enviarPaso(_proveedorCampanaId, destinatario) {
      llamadas.push(destinatario.email ?? '');
      if (!comportamiento(destinatario)) throw new Error('fallo simulado de Apollo');
      return { proveedor: 'apollo', proveedorMensajeId: `msg-${destinatario.email}` };
    },
  };
}

const filaBase = (id: number, email: string): FilaSimulada => ({
  idPasoInscripcion: id,
  proveedorCampanaId: 'seq-1',
  destinatario: { email, telefono: null, nombre: null, empresa: null, cargo: null },
  paso: { asunto: 'Hola', cuerpo: 'cuerpo', canal: 'correo' },
  intentos: 0,
  estado: 'pendiente',
});

test('un fallo a mitad de lote de 3 no bloquea a los demas, y la corrida siguiente reanuda SOLO el que fallo', async () => {
  const iniciales = [filaBase(1, 'ana@empresa.com'), filaBase(2, 'beto@empresa.com'), filaBase(3, 'clara@empresa.com')];
  // beto falla en la primera corrida; ana y clara pasan.
  const envio = envioFalso((d) => d.email !== 'beto@empresa.com');
  const { deps, filas, enviandoLlamado } = depsFalsos(iniciales);

  await pushPendientes(deps, envio);

  assert.deepEqual(envio.llamadas.sort(), ['ana@empresa.com', 'beto@empresa.com', 'clara@empresa.com']);
  assert.strictEqual(filas.get(1)!.estado, 'enviada');
  assert.strictEqual(filas.get(2)!.estado, 'fallo');
  assert.strictEqual(filas.get(3)!.estado, 'enviada');
  assert.deepEqual(enviandoLlamado.sort(), [1, 2, 3]);

  // Corrida siguiente: ana y clara ya no aparecen en pendientes() (ya estan
  // 'enviada'), asi que pushPendientes NUNCA vuelve a llamar a Apollo por ellas --
  // nunca duplica ni contacto ni envio, aunque el proceso se haya reanudado.
  envio.llamadas.length = 0;
  const envioSegundaCorrida = envioFalso(() => true); // beto ahora si pasa
  await pushPendientes(deps, envioSegundaCorrida);

  assert.deepEqual(envioSegundaCorrida.llamadas, ['beto@empresa.com']);
  assert.strictEqual(filas.get(2)!.estado, 'enviada');
});

test('marcarEnviada recibe el proveedor real del EnvioResultado, no un valor fijo (sesion 2026-07-09)', async () => {
  const { deps, filas } = depsFalsos([filaBase(1, 'ana@empresa.com')]);
  const envio: CanalEntrega = {
    async enviarPaso() {
      return { proveedor: 'un-proveedor-cualquiera', proveedorMensajeId: 'msg-1' };
    },
  };

  await pushPendientes(deps, envio);

  assert.strictEqual(filas.get(1)!.proveedorRegistrado, 'un-proveedor-cualquiera');
});

test('push dos veces sobre una fila ya enviada no vuelve a llamar a Apollo', async () => {
  const { deps } = depsFalsos([filaBase(1, 'ana@empresa.com')]);
  const envio = envioFalso(() => true);

  await pushPendientes(deps, envio);
  await pushPendientes(deps, envio);

  assert.strictEqual(envio.llamadas.length, 1);
});

test('tras agotar MAX_INTENTOS, marcarFallo recibe proximoIntento null (no se reintenta mas)', async () => {
  const fila = { ...filaBase(1, 'ana@empresa.com'), intentos: MAX_INTENTOS - 1 };
  const { deps } = depsFalsos([fila]);
  const envio = envioFalso(() => false);

  const fallidos: { intentos: number; proximoIntento: string | null }[] = [];
  const depsConCaptura: PushDeps = {
    ...deps,
    marcarFallo: (id, intentos, proximoIntento) => {
      fallidos.push({ intentos, proximoIntento });
      deps.marcarFallo(id, intentos, proximoIntento);
    },
  };

  await pushPendientes(depsConCaptura, envio);

  assert.strictEqual(fallidos[0].intentos, MAX_INTENTOS);
  assert.strictEqual(fallidos[0].proximoIntento, null);
});

test('calcularProximoIntentoPush crece y tiene tope', () => {
  const ahora = new Date('2026-07-06T10:00:00.000Z');
  const t1 = calcularProximoIntentoPush(1, ahora).getTime() - ahora.getTime();
  const t5 = calcularProximoIntentoPush(5, ahora).getTime() - ahora.getTime();
  const t99 = calcularProximoIntentoPush(99, ahora).getTime() - ahora.getTime();
  assert.ok(t1 < t5);
  assert.strictEqual(t5, t99);
});

test('con throttleMs>0, espera entre envios consecutivos (no rafaga)', async () => {
  const iniciales = [filaBase(1, 'ana@empresa.com'), filaBase(2, 'beto@empresa.com')];
  const { deps } = depsFalsos(iniciales);
  const envio = envioFalso(() => true);

  const inicio = Date.now();
  await pushPendientes(deps, envio, new Date(), 50);
  const duracion = Date.now() - inicio;

  assert.equal(envio.llamadas.length, 2);
  assert.ok(duracion >= 50, `deberia tardar al menos 50ms por el throttle entre los 2 envios, tardo ${duracion}ms`);
});

test('sin throttleMs (default), no espera entre envios', async () => {
  const iniciales = [filaBase(1, 'ana@empresa.com'), filaBase(2, 'beto@empresa.com')];
  const { deps } = depsFalsos(iniciales);
  const envio = envioFalso(() => true);

  const inicio = Date.now();
  await pushPendientes(deps, envio);
  const duracion = Date.now() - inicio;

  assert.ok(duracion < 50, `sin throttle no deberia tardar casi nada, tardo ${duracion}ms`);
});
