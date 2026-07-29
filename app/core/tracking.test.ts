import test from 'node:test';
import assert from 'node:assert/strict';
import { pollTracking, type TrackingDeps, type CampanaConSecuencia, type DestinatarioResuelto, type PollDeCampana } from './tracking.ts';
import type { EnvioAdapter, EventoProveedor, TrackingPoll } from './ports/envio.ts';

function envioFalso(eventosPorReferencia: Record<string, EventoProveedor[]>): EnvioAdapter {
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
    async aprobarSecuencia() {},
    async archivarCampana() {},
    async leerEventosNuevos(referencia) {
      return eventosPorReferencia[referencia] ?? [];
    },
  };
}

const campana = (over: Partial<CampanaConSecuencia> = {}): CampanaConSecuencia => ({
  idCampana: 1,
  proveedorCampanaId: 'seq-1',
  owner: null,
  idOrganizacion: 1,
  ...over,
});

function depsFalsos(
  destinatarios: Record<string, DestinatarioResuelto>,
  activosPorInscripcion: Record<number, boolean>,
  envio: TrackingPoll,
) {
  const eventosGuardados = new Set<string>();
  const pausadas: { idInscripcion: number; motivo: string }[] = [];
  const salidos: number[] = [];
  const notificadas: { idInscripcion: number; idEmpresa: string; canal: string }[] = [];

  const deps: TrackingDeps = {
    campanasConSecuencia: (): CampanaConSecuencia[] => [campana()],
    // Default: un solo proveedor que lee por el id de la campana (el caso Apollo).
    resolverPoll: (camp): PollDeCampana => ({ proveedor: 'apollo', adaptador: envio, referencias: [camp.proveedorCampanaId] }),
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
    registrarRespuestaDetectada: (idInscripcion, idEmpresa, canal) => {
      notificadas.push({ idInscripcion, idEmpresa, canal });
    },
  };
  return { deps, pausadas, salidos, eventosGuardados, notificadas };
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

const ana = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10, idEmpresa: 'emp-A' } };

test('un reply pausa la inscripcion de inmediato', async () => {
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-reply', tipo: 'respondio' })] });
  const { deps, pausadas } = depsFalsos(ana, { 10: true }, envio);

  await pollTracking(deps);

  assert.strictEqual(pausadas.length, 1);
  assert.strictEqual(pausadas[0].idInscripcion, 10);
  assert.strictEqual(pausadas[0].motivo, 'respuesta detectada');
});

test('un reply tambien registra la respuesta detectada (empresa + canal del evento)', async () => {
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-reply', tipo: 'respondio', canal: 'correo' })] });
  const { deps, notificadas } = depsFalsos(ana, { 10: true }, envio);

  await pollTracking(deps);

  assert.deepEqual(notificadas, [{ idInscripcion: 10, idEmpresa: 'emp-A', canal: 'correo' }]);
});

test('un bounce NO registra respuesta detectada (no es una respuesta)', async () => {
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-bounce', tipo: 'rebota' })] });
  const { deps, notificadas } = depsFalsos(ana, { 10: true }, envio);

  await pollTracking(deps);

  assert.deepEqual(notificadas, []);
});

test('un bounce marca al destinatario como salio; si quedan otros activos, la inscripcion NO se pausa', async () => {
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-bounce', tipo: 'rebota' })] });
  const { deps, pausadas, salidos } = depsFalsos(ana, { 10: true }, envio); // quedanActivos=true

  await pollTracking(deps);

  assert.deepEqual(salidos, [1]);
  assert.strictEqual(pausadas.length, 0);
});

test('un bounce cuando YA NO quedan destinatarios activos pausa la inscripcion con motivo visible', async () => {
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-bounce-2', tipo: 'rebota' })] });
  const { deps, pausadas } = depsFalsos(ana, { 10: false }, envio); // ya no quedan activos

  await pollTracking(deps);

  assert.strictEqual(pausadas.length, 1);
  assert.strictEqual(pausadas[0].motivo, 'todos los destinatarios salieron (rebote)');
});

test('doble poll del mismo evento no se duplica ni pausa dos veces', async () => {
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-reply', tipo: 'respondio' })] });
  const { deps, pausadas } = depsFalsos(ana, { 10: true }, envio);

  await pollTracking(deps);
  await pollTracking(deps); // mismo evento, misma corrida de nuevo

  assert.strictEqual(pausadas.length, 1, 'el segundo poll no vuelve a pausar (el evento ya se proceso)');
});

test('un evento de un email que no reconocemos se ignora sin tronar', async () => {
  const envio = envioFalso({ 'seq-1': [evento({ email: 'desconocido@x.com', tipo: 'respondio' })] });
  const { deps, pausadas } = depsFalsos({}, {}, envio);

  await pollTracking(deps);

  assert.strictEqual(pausadas.length, 0);
});

test('una campana cuyo leerEventosNuevos truena no bloquea el poll de las demas', async () => {
  const envio: TrackingPoll = {
    async sacarDestinatario() {},
    async leerEventosNuevos(referencia) {
      if (referencia === 'seq-rota') throw new Error('Apollo 404');
      return [evento({ proveedorEventoId: 'evt-reply', tipo: 'respondio' })];
    },
  };
  const { deps, pausadas } = depsFalsos(ana, { 10: true }, envio);
  deps.campanasConSecuencia = () => [campana({ idCampana: 1, proveedorCampanaId: 'seq-rota' }), campana({ idCampana: 2, proveedorCampanaId: 'seq-1' })];

  const resultado = await pollTracking(deps);

  assert.strictEqual(pausadas.length, 1, 'la campana sana si se proceso pese al fallo de la otra');
  assert.strictEqual(resultado.campanasConsultadas, 2);
  assert.strictEqual(resultado.campanasFallidas, 1);
});

// --- Ruteo por proveedor (bug 2026-07-28) -------------------------------------------------

test('cada campana se consulta con SU proveedor: la de Gmail por hilo, la de Apollo por secuencia', async () => {
  const consultadoPorApollo: string[] = [];
  const consultadoPorGmail: string[] = [];
  const apollo: TrackingPoll = {
    async sacarDestinatario() {},
    async leerEventosNuevos(referencia) {
      consultadoPorApollo.push(referencia);
      return [];
    },
  };
  const gmail: TrackingPoll = {
    async sacarDestinatario() {},
    async leerEventosNuevos(referencia) {
      consultadoPorGmail.push(referencia);
      return referencia === 'hilo-1' ? [evento({ proveedorEventoId: 'evt-gmail', tipo: 'respondio' })] : [];
    },
  };

  const { deps, pausadas, notificadas } = depsFalsos(ana, { 10: true }, apollo);
  deps.campanasConSecuencia = () => [
    campana({ idCampana: 1, proveedorCampanaId: 'seq-apollo', owner: null }),
    campana({ idCampana: 57, proveedorCampanaId: 'gmail-camp-57', owner: 'Sebastian Acosta Molina' }),
  ];
  deps.resolverPoll = (camp) =>
    camp.owner === 'Sebastian Acosta Molina'
      ? { proveedor: 'gmail', adaptador: gmail, referencias: ['hilo-1', 'hilo-2'] }
      : { proveedor: 'apollo', adaptador: apollo, referencias: [camp.proveedorCampanaId] };

  await pollTracking(deps);

  assert.deepEqual(consultadoPorApollo, ['seq-apollo'], 'a Apollo nunca se le pregunta por la campana de Gmail');
  assert.deepEqual(consultadoPorGmail, ['hilo-1', 'hilo-2'], 'a Gmail se le pregunta hilo por hilo, no por el id de campana');
  assert.strictEqual(pausadas.length, 1, 'la respuesta que llego por Gmail SI corta la cadencia');
  assert.deepEqual(notificadas, [{ idInscripcion: 10, idEmpresa: 'emp-A', canal: 'correo' }], 'y deja la misma notificacion que WhatsApp');
});

test('el destinatario se resuelve por el id de CAMPANA, no por la referencia del proveedor', async () => {
  const pedidos: string[] = [];
  const gmail: TrackingPoll = {
    async sacarDestinatario() {},
    async leerEventosNuevos() {
      return [evento({ proveedorEventoId: 'evt-gmail', tipo: 'respondio' })];
    },
  };
  const { deps } = depsFalsos(ana, { 10: true }, gmail);
  deps.campanasConSecuencia = () => [campana({ idCampana: 57, proveedorCampanaId: 'gmail-camp-57' })];
  deps.resolverPoll = () => ({ proveedor: 'gmail', adaptador: gmail, referencias: ['hilo-1'] });
  const original = deps.resolverDestinatario;
  deps.resolverDestinatario = (proveedorCampanaId, email) => {
    pedidos.push(proveedorCampanaId);
    return original(proveedorCampanaId, email);
  };

  await pollTracking(deps);

  assert.deepEqual(pedidos, ['gmail-camp-57'], 'un hilo de Gmail no identifica campana en nuestra base');
});

test('una campana de Gmail sin envios todavia no cuenta como consultada ni como fallida', async () => {
  const gmail: TrackingPoll = {
    async sacarDestinatario() {},
    async leerEventosNuevos() {
      throw new Error('no se deberia consultar nada');
    },
  };
  const { deps } = depsFalsos(ana, { 10: true }, gmail);
  deps.resolverPoll = () => ({ proveedor: 'gmail', adaptador: gmail, referencias: [] });

  const resultado = await pollTracking(deps);

  assert.deepEqual(resultado, { campanasConsultadas: 0, campanasFallidas: 0, fallas: [] });
});

// --- Que la falla deje rastro (bug 2026-07-28) --------------------------------------------

test('cada referencia caida se reporta con campana, proveedor y error', async () => {
  const gmail: TrackingPoll = {
    async sacarDestinatario() {},
    async leerEventosNuevos() {
      throw new Error('Gmail respondio 404 al leer el hilo');
    },
  };
  const avisos: string[] = [];
  const { deps } = depsFalsos(ana, { 10: true }, gmail);
  deps.campanasConSecuencia = () => [campana({ idCampana: 57, proveedorCampanaId: 'gmail-camp-57' })];
  deps.resolverPoll = () => ({ proveedor: 'gmail', adaptador: gmail, referencias: ['hilo-1'] });
  deps.onFalla = (f) => avisos.push(`${f.idCampana}/${f.proveedor}/${f.referencia}/${f.error}`);

  const resultado = await pollTracking(deps);

  assert.deepEqual(avisos, ['57/gmail/hilo-1/Gmail respondio 404 al leer el hilo']);
  assert.strictEqual(resultado.campanasFallidas, 1);
  assert.strictEqual(resultado.fallas[0].proveedorCampanaId, 'gmail-camp-57');
});

test('un solo hilo roto entre varios NO marca la campana como caida', async () => {
  const gmail: TrackingPoll = {
    async sacarDestinatario() {},
    async leerEventosNuevos(referencia) {
      if (referencia === 'hilo-roto') throw new Error('404');
      return [];
    },
  };
  const { deps } = depsFalsos(ana, { 10: true }, gmail);
  deps.resolverPoll = () => ({ proveedor: 'gmail', adaptador: gmail, referencias: ['hilo-roto', 'hilo-sano'] });

  const resultado = await pollTracking(deps);

  assert.strictEqual(resultado.campanasConsultadas, 1);
  assert.strictEqual(resultado.campanasFallidas, 0, 'la campana se leyo: un hilo de veinte no la tumba');
  assert.strictEqual(resultado.fallas.length, 1, 'pero el hilo roto igual queda anotado');
});

test('resolver el proveedor tronando cuenta como campana fallida y deja rastro', async () => {
  const { deps } = depsFalsos(ana, { 10: true }, envioFalso({}));
  deps.campanasConSecuencia = () => [campana({ idCampana: 57, proveedorCampanaId: 'gmail-camp-57' })];
  deps.resolverPoll = () => {
    throw new Error('No hay Gmail conectado para el usuario abc');
  };

  const resultado = await pollTracking(deps);

  assert.strictEqual(resultado.campanasConsultadas, 1);
  assert.strictEqual(resultado.campanasFallidas, 1);
  assert.strictEqual(resultado.fallas[0].proveedor, 'sin resolver');
  assert.match(resultado.fallas[0].error, /No hay Gmail conectado/);
});
