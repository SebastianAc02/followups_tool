import test from 'node:test';
import assert from 'node:assert/strict';
import { previsualizarInscripcion } from './preview-inscripcion.ts';

// Fase 6 (V4 Destinatarios): dado un lote de empresas (con sus contactos) + los pasos
// de la cadencia + la regla de canal faltante, decide por empresa a quien le toca, con
// que cadencia ajustada, cuantos toques totales y en que estado queda. PURO: no toca DB,
// el Repository le pasa los datos ya leidos (mismo patron que empresasConReadiness).

const pasosCorreoLlamada = [
  { orden: 1, canal: 'correo' as const },
  { orden: 2, canal: 'llamada' as const },
];

test('empresa con todos los canales y contacto con email -> lista', () => {
  const [r] = previsualizarInscripcion({
    empresas: [
      {
        idEmpresa: 'e1',
        contactos: [{ idContacto: 1, esKeyDecisionMaker: false, esPrincipal: true, email: 'a@b.co', telefono: '3001112222' }],
      },
    ],
    pasos: pasosCorreoLlamada,
    regla: 'saltar',
  });

  assert.equal(r.idEmpresa, 'e1');
  assert.equal(r.idContactoDestinatario, 1);
  assert.equal(r.estado, 'lista');
  assert.equal(r.toquesTotales, 2);
  assert.deepEqual(
    r.pasosAjustados.map((p) => ({ orden: p.orden, canal: p.canal, omitido: p.omitido })),
    [
      { orden: 1, canal: 'correo', omitido: false },
      { orden: 2, canal: 'llamada', omitido: false },
    ],
  );
});

test('empresa sin email en ningun contacto -> bloqueada (sin destinatario), sin importar la regla', () => {
  const [r] = previsualizarInscripcion({
    empresas: [
      {
        idEmpresa: 'e2',
        contactos: [{ idContacto: 2, esKeyDecisionMaker: false, esPrincipal: true, email: null, telefono: '3001112222' }],
      },
    ],
    pasos: pasosCorreoLlamada,
    regla: 'saltar',
  });

  assert.equal(r.idContactoDestinatario, null);
  assert.equal(r.estado, 'bloqueada');
  assert.equal(r.toquesTotales, 0);
});

test('regla reemplazar: paso sin canal se reasigna, cadencia ajustada trae el canal final y estado con_ajuste', () => {
  const [r] = previsualizarInscripcion({
    empresas: [
      {
        idEmpresa: 'e3',
        contactos: [{ idContacto: 3, esKeyDecisionMaker: false, esPrincipal: true, email: 'a@b.co', telefono: null }],
      },
    ],
    pasos: pasosCorreoLlamada,
    regla: 'reemplazar',
  });

  assert.equal(r.estado, 'con_ajuste');
  assert.equal(r.toquesTotales, 2);
  assert.deepEqual(
    r.pasosAjustados.map((p) => ({ orden: p.orden, canal: p.canal, omitido: p.omitido })),
    [
      { orden: 1, canal: 'correo', omitido: false },
      { orden: 2, canal: 'correo', omitido: false },
    ],
  );
});

test('regla saltar: paso sin canal queda marcado omitido y no cuenta en toques totales', () => {
  const [r] = previsualizarInscripcion({
    empresas: [
      {
        idEmpresa: 'e4',
        contactos: [{ idContacto: 4, esKeyDecisionMaker: false, esPrincipal: true, email: 'a@b.co', telefono: null }],
      },
    ],
    pasos: pasosCorreoLlamada,
    regla: 'saltar',
  });

  assert.equal(r.estado, 'con_ajuste');
  assert.equal(r.toquesTotales, 1);
  assert.deepEqual(
    r.pasosAjustados.map((p) => ({ orden: p.orden, canal: p.canal, omitido: p.omitido })),
    [
      { orden: 1, canal: 'correo', omitido: false },
      { orden: 2, canal: 'llamada', omitido: true },
    ],
  );
});

test('empresa sin ningun canal disponible -> bloqueada aunque tenga contacto (sin telefono ni email valido)', () => {
  const [r] = previsualizarInscripcion({
    empresas: [
      { idEmpresa: 'e5', contactos: [{ idContacto: 5, esKeyDecisionMaker: false, esPrincipal: true, email: null, telefono: null }] },
    ],
    pasos: pasosCorreoLlamada,
    regla: 'reemplazar',
  });

  assert.equal(r.estado, 'bloqueada');
  assert.equal(r.idContactoDestinatario, null);
});

test('procesa un lote de varias empresas manteniendo el orden de entrada', () => {
  const resultados = previsualizarInscripcion({
    empresas: [
      { idEmpresa: 'a', contactos: [{ idContacto: 10, esKeyDecisionMaker: true, esPrincipal: false, email: 'a@x.co', telefono: null }] },
      { idEmpresa: 'b', contactos: [{ idContacto: 11, esKeyDecisionMaker: false, esPrincipal: false, email: null, telefono: null }] },
    ],
    pasos: pasosCorreoLlamada,
    regla: 'cola',
  });

  assert.deepEqual(resultados.map((r) => r.idEmpresa), ['a', 'b']);
  assert.equal(resultados[0].estado, 'con_ajuste');
  assert.equal(resultados[1].estado, 'bloqueada');
});

test('resultado es serializable (JSON.stringify/parse sin perder datos)', () => {
  const resultados = previsualizarInscripcion({
    empresas: [
      { idEmpresa: 'e1', contactos: [{ idContacto: 1, esKeyDecisionMaker: false, esPrincipal: true, email: 'a@b.co', telefono: null }] },
    ],
    pasos: pasosCorreoLlamada,
    regla: 'saltar',
  });
  const ida = JSON.parse(JSON.stringify(resultados));
  assert.deepEqual(ida, resultados);
});
