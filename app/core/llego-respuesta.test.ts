// Tarea 6: caso de uso de respuesta entrante de WhatsApp. Dos bloques:
//  (1) resolverPorUltimos10 / normalizarTelefono: matcher PURO (decision A). Verde ya.
//  (2) procesarRespuestaEntrante: contrato con deps falsas. ROJO A PROPOSITO hasta que
//      Sebastian escriba el cuerpo (hueco learning-mode en llego-respuesta.ts). Los tests
//      fijan los OUTCOMES no negociables de las decisiones A/B/C, no el orden interno.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarTelefono,
  resolverPorUltimos10,
  procesarRespuestaEntrante,
  type MensajeEntrante,
  type ContactoMatch,
  type InscripcionActiva,
  type RespuestaEntranteDeps,
} from './llego-respuesta.ts';
import type { TrackingPoll, EventoProveedor } from './ports/envio.ts';

// ── (1) matcher puro ────────────────────────────────────────────────────────────
const cand = (idContacto: number, idEmpresa: string, telefono: string | null) => ({
  idContacto,
  idEmpresa,
  idOrganizacion: 1,
  telefono,
});

test('normalizarTelefono deja solo digitos', () => {
  assert.equal(normalizarTelefono('+57 (310) 518-2997'), '573105182997');
});

test('matchea por ultimos 10 digitos aunque un lado traiga 57 y el otro no', () => {
  const candidatos = [cand(7, 'emp-A', '3022482292'), cand(9, 'emp-B', '+57 320 111 2233')];
  const m = resolverPorUltimos10(candidatos, '573022482292@ya-normalizado');
  assert.deepEqual(m, { idContacto: 7, idEmpresa: 'emp-A', idOrganizacion: 1 });
});

test('sin match devuelve null', () => {
  assert.equal(resolverPorUltimos10([cand(1, 'x', '3001112222')], '573334445555'), null);
});

test('numero muy corto (menos de 10 digitos) no matchea', () => {
  assert.equal(resolverPorUltimos10([cand(1, 'x', '123456')], '123456'), null);
});

test('ignora candidatos sin telefono', () => {
  assert.equal(resolverPorUltimos10([cand(1, 'x', null)], '573022482292'), null);
});

// ── (2) contrato del caso de uso (ROJO hasta que se escriba el cuerpo) ─────────────
function fakes() {
  const calls = {
    registrarEntrante: [] as { m: MensajeEntrante; match: ContactoMatch | null }[],
    pausar: [] as number[],
    sacar: [] as { seq: string; email: string }[],
    toque: [] as { match: ContactoMatch; texto: string }[],
  };
  let matchResult: ContactoMatch | null = null;
  let activas: InscripcionActiva[] = [];
  let dup = false;

  const deps: RespuestaEntranteDeps = {
    registrarEntrante: (m, match) => {
      calls.registrarEntrante.push({ m, match });
      return dup ? 'duplicado' : 'insertado';
    },
    matchearContacto: () => matchResult,
    inscripcionesActivas: () => activas,
    pausarInscripcion: (id) => calls.pausar.push(id),
    registrarToqueEntrante: (match, texto) => calls.toque.push({ match, texto }),
  };
  const envio: TrackingPoll = {
    sacarDestinatario: async (seq, email) => {
      calls.sacar.push({ seq, email });
    },
    leerEventosNuevos: async (): Promise<EventoProveedor[]> => [],
  };
  return {
    calls,
    envio,
    deps,
    set: (o: { match?: ContactoMatch | null; activas?: InscripcionActiva[]; dup?: boolean }) => {
      if ('match' in o) matchResult = o.match ?? null;
      if (o.activas) activas = o.activas;
      if (o.dup !== undefined) dup = o.dup;
    },
  };
}

const mensaje: MensajeEntrante = {
  referenciaProveedor: 'prueba',
  telefono: '573022482292',
  texto: 'Si me interesa',
  mensajeId: 'MSG-1',
  fecha: '2026-07-09T22:51:38.586Z',
};
const match: ContactoMatch = { idContacto: 7, idEmpresa: 'emp-A', idOrganizacion: 1 };

test('reply con match + inscripcion Apollo: pausa local, corta Apollo y deja toque', async () => {
  const f = fakes();
  f.set({ match, activas: [{ idInscripcion: 42, proveedorCampanaId: 'seq-1', email: 'ana@x.com' }] });
  await procesarRespuestaEntrante(f.deps, f.envio, mensaje);
  assert.deepEqual(f.calls.pausar, [42], 'pausa la inscripcion local');
  assert.deepEqual(f.calls.sacar, [{ seq: 'seq-1', email: 'ana@x.com' }], 'corta la secuencia en Apollo');
  assert.equal(f.calls.toque.length, 1, 'deja el toque entrante');
  assert.equal(f.calls.toque[0].texto, 'Si me interesa');
});

test('idempotencia: un mensaje duplicado no re-ejecuta efectos', async () => {
  const f = fakes();
  f.set({ match, activas: [{ idInscripcion: 42, proveedorCampanaId: 'seq-1', email: 'ana@x.com' }], dup: true });
  await procesarRespuestaEntrante(f.deps, f.envio, mensaje);
  assert.deepEqual(f.calls.pausar, [], 'no pausa');
  assert.deepEqual(f.calls.sacar, [], 'no corta Apollo');
  assert.equal(f.calls.toque.length, 0, 'no deja toque');
});

test('numero desconocido (sin match): registra para auditoria, sin cortar nada', async () => {
  const f = fakes();
  f.set({ match: null });
  await procesarRespuestaEntrante(f.deps, f.envio, mensaje);
  assert.equal(f.calls.registrarEntrante.length, 1, 'registra el entrante');
  assert.equal(f.calls.registrarEntrante[0].match, null);
  assert.deepEqual(f.calls.pausar, [], 'no hay cadencia que cortar');
  assert.equal(f.calls.toque.length, 0, 'sin empresa no hay toque');
});

test('inscripcion sin secuencia Apollo (o sin email): corta local y deja toque, no toca Apollo', async () => {
  const f = fakes();
  f.set({ match, activas: [{ idInscripcion: 55, proveedorCampanaId: null, email: null }] });
  await procesarRespuestaEntrante(f.deps, f.envio, mensaje);
  assert.deepEqual(f.calls.pausar, [55], 'pausa local igual');
  assert.deepEqual(f.calls.sacar, [], 'no hay a quien sacar de Apollo');
  assert.equal(f.calls.toque.length, 1, 'deja el toque');
});
