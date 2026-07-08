import test from 'node:test';
import assert from 'node:assert/strict';
import { pollTracking, type TrackingDeps, type CampanaConSecuencia, type DestinatarioResuelto } from './tracking.ts';
import type { EnvioAdapter, EventoProveedor } from './ports/envio.ts';

function envioFalso(eventosPorCampana: Record<string, EventoProveedor[]>): EnvioAdapter {
  return {
    async crearCampanaExterna() {
      return 'seq-fake';
    },
    async sincronizarCopy() {
      return [];
    },
    async enviarPaso() {
      throw new Error('no usado en estas pruebas');
    },
    async sacarDestinatario() {},
    async archivarCampana() {},
    async leerEventosNuevos(proveedorCampanaId) {
      return eventosPorCampana[proveedorCampanaId] ?? [];
    },
  };
}

function depsFalsos(destinatarios: Record<string, DestinatarioResuelto>, activosPorInscripcion: Record<number, boolean>) {
  const eventosGuardados = new Set<string>();
  const pausadas: { idInscripcion: number; motivo: string }[] = [];
  const salidos: number[] = [];

  const deps: TrackingDeps = {
    campanasConSecuencia: (): CampanaConSecuencia[] => [{ idCampana: 1, proveedorCampanaId: 'seq-1' }],
    resolverDestinatario: (_proveedorCampanaId, email) => destinatarios[email] ?? null,
    guardarEvento: (_id, evento) => {
      if (eventosGuardados.has(evento.proveedorEventoId)) return 'duplicado';
      eventosGuardados.add(evento.proveedorEventoId);
      return 'insertado';
    },
    pausarInscripcion: (idInscripcion, motivo) => {
      pausadas.push({ idInscripcion, motivo });
      activosPorInscripcion[idInscripcion] = false;
    },
    marcarDestinatarioSalio: (idDestinatario) => {
      salidos.push(idDestinatario);
    },
    quedanDestinatariosActivos: (idInscripcion) => activosPorInscripcion[idInscripcion] ?? false,
  };
  return { deps, pausadas, salidos, eventosGuardados };
}

const evento = (over: Partial<EventoProveedor>): EventoProveedor => ({
  proveedorEventoId: 'evt-1',
  tipo: 'abierto',
  canal: 'correo',
  fechaEvento: '2026-07-06T10:00:00.000Z',
  email: 'ana@empresa.com',
  detalle: {},
  ...over,
});

test('un reply pausa la inscripcion de inmediato', async () => {
  const destinatarios = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10 } };
  const { deps, pausadas } = depsFalsos(destinatarios, { 10: true });
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-reply', tipo: 'respondio' })] });

  await pollTracking(deps, envio);

  assert.strictEqual(pausadas.length, 1);
  assert.strictEqual(pausadas[0].idInscripcion, 10);
  assert.strictEqual(pausadas[0].motivo, 'respuesta detectada');
});

test('un bounce marca al destinatario como salio; si quedan otros activos, la inscripcion NO se pausa', async () => {
  const destinatarios = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10 } };
  const { deps, pausadas, salidos } = depsFalsos(destinatarios, { 10: true }); // quedanActivos=true (otro destinatario sigue vivo)
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-bounce', tipo: 'rebota' })] });

  await pollTracking(deps, envio);

  assert.deepEqual(salidos, [1]);
  assert.strictEqual(pausadas.length, 0);
});

test('un bounce cuando YA NO quedan destinatarios activos pausa la inscripcion con motivo visible', async () => {
  const destinatarios = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10 } };
  const { deps, pausadas } = depsFalsos(destinatarios, { 10: false }); // ya no quedan activos
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-bounce-2', tipo: 'rebota' })] });

  await pollTracking(deps, envio);

  assert.strictEqual(pausadas.length, 1);
  assert.strictEqual(pausadas[0].motivo, 'todos los destinatarios salieron (rebote)');
});

test('doble poll del mismo evento no se duplica ni pausa dos veces', async () => {
  const destinatarios = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10 } };
  const { deps, pausadas } = depsFalsos(destinatarios, { 10: true });
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-reply', tipo: 'respondio' })] });

  await pollTracking(deps, envio);
  await pollTracking(deps, envio); // mismo evento, misma corrida de nuevo

  assert.strictEqual(pausadas.length, 1, 'el segundo poll no vuelve a pausar (el evento ya se proceso)');
});

test('un evento de un email que no reconocemos se ignora sin tronar', async () => {
  const { deps, pausadas } = depsFalsos({}, {});
  const envio = envioFalso({ 'seq-1': [evento({ email: 'desconocido@x.com', tipo: 'respondio' })] });

  await pollTracking(deps, envio);

  assert.strictEqual(pausadas.length, 0);
});

test('una campana cuyo leerEventosNuevos truena no bloquea el poll de las demas', async () => {
  const destinatarios = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10 } };
  const { deps, pausadas } = depsFalsos(destinatarios, { 10: true });
  deps.campanasConSecuencia = () => [
    { idCampana: 1, proveedorCampanaId: 'seq-rota' },
    { idCampana: 2, proveedorCampanaId: 'seq-1' },
  ];
  const envio: EnvioAdapter = {
    async crearCampanaExterna() {
      return 'x';
    },
    async sincronizarCopy() {
      return [];
    },
    async enviarPaso() {
      throw new Error('no usado');
    },
    async sacarDestinatario() {},
    async archivarCampana() {},
    async leerEventosNuevos(proveedorCampanaId) {
      if (proveedorCampanaId === 'seq-rota') throw new Error('Apollo 404');
      return [evento({ proveedorEventoId: 'evt-reply', tipo: 'respondio' })];
    },
  };

  await pollTracking(deps, envio);

  assert.strictEqual(pausadas.length, 1, 'la campana sana si se proceso pese al fallo de la otra');
});
