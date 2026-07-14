import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canalesDisponiblesKDM, estaEnPBX, proponerSiguientePaso, sugerirEscalar } from './pbx.ts';

test('canalesDisponiblesKDM ignora contactos que no son KDM', () => {
  const disponibles = canalesDisponiblesKDM([
    { esKeyDecisionMaker: false, telefono: '3001234567', email: 'oficina@empresa.com' },
  ]);
  assert.equal(disponibles.size, 0);
});

test('canalesDisponiblesKDM cuenta telefono y correo del KDM', () => {
  const disponibles = canalesDisponiblesKDM([
    { esKeyDecisionMaker: true, telefono: '3001234567', email: 'gerente@empresa.com' },
  ]);
  assert.deepEqual([...disponibles].sort(), ['correo', 'llamada', 'whatsapp']);
});

test('estaEnPBX: empresa con solo contacto de oficina (no-KDM) con telefono esta en PBX', () => {
  const contactos = [
    { esKeyDecisionMaker: false, telefono: '3001234567', email: null },
  ];
  assert.equal(estaEnPBX(contactos), true);
});

test('estaEnPBX: empresa con un KDM con telefono no esta en PBX', () => {
  const contactos = [
    { esKeyDecisionMaker: true, telefono: '3001234567', email: null },
  ];
  assert.equal(estaEnPBX(contactos), false);
});

test('estaEnPBX: empresa sin contactos esta en PBX', () => {
  assert.equal(estaEnPBX([]), true);
});

test('estaEnPBX: KDM con solo correo (sin telefono) ya no esta en PBX', () => {
  const contactos = [
    { esKeyDecisionMaker: true, telefono: null, email: 'gerente@empresa.com' },
  ];
  assert.equal(estaEnPBX(contactos), false);
});

test('proponerSiguientePaso: entrada con numero de conmutador -> llamar_conmutador', () => {
  const paso = proponerSiguientePaso({
    resultado: null,
    tieneNumeroConmutador: true,
    intentos: { llamadas: 0, correos: 0 },
  });
  assert.equal(paso.forma, 'llamar_conmutador');
});

test('proponerSiguientePaso: entrada sin numero de conmutador -> conseguir_numero', () => {
  const paso = proponerSiguientePaso({
    resultado: null,
    tieneNumeroConmutador: false,
    intentos: { llamadas: 0, correos: 0 },
  });
  assert.equal(paso.forma, 'conseguir_numero');
});

test('proponerSiguientePaso: pidieron_correo -> enviar_correo', () => {
  const paso = proponerSiguientePaso({
    resultado: { clase: 'pidieron_correo', nota: 'me pidieron mandar correo' },
    tieneNumeroConmutador: true,
    intentos: { llamadas: 1, correos: 0 },
  });
  assert.equal(paso.forma, 'enviar_correo');
});

test('proponerSiguientePaso: otro (p.ej. correo ya enviado) -> esperar ~3 dias', () => {
  const paso = proponerSiguientePaso({
    resultado: { clase: 'otro', nota: 'envie el correo' },
    tieneNumeroConmutador: true,
    intentos: { llamadas: 1, correos: 1 },
  });
  assert.equal(paso.forma, 'esperar');
  assert.equal(paso.diasSugeridos, 3);
});

test('proponerSiguientePaso: sin_respuesta -> llamar_conmutador a ~2 dias', () => {
  const paso = proponerSiguientePaso({
    resultado: { clase: 'sin_respuesta', nota: 'no contestaron' },
    tieneNumeroConmutador: true,
    intentos: { llamadas: 1, correos: 1 },
  });
  assert.equal(paso.forma, 'llamar_conmutador');
  assert.equal(paso.diasSugeridos, 2);
});

test('proponerSiguientePaso: referido_persona -> hablar_con', () => {
  const paso = proponerSiguientePaso({
    resultado: { clase: 'referido_persona', nota: 'hable con Andrea', personaReferida: 'Andrea de compras' },
    tieneNumeroConmutador: true,
    intentos: { llamadas: 1, correos: 0 },
  });
  assert.equal(paso.forma, 'hablar_con');
  assert.match(paso.nota, /Andrea/);
});

test('proponerSiguientePaso: dato_conseguido -> graduar', () => {
  const paso = proponerSiguientePaso({
    resultado: { clase: 'dato_conseguido', nota: 'me dieron el celular del gerente' },
    tieneNumeroConmutador: true,
    intentos: { llamadas: 2, correos: 1 },
  });
  assert.equal(paso.forma, 'graduar');
});

test('sugerirEscalar: 3 intentos combinados sugiere escalar', () => {
  assert.equal(sugerirEscalar({ llamadas: 2, correos: 1 }), true);
});

test('sugerirEscalar: menos de 3 intentos no sugiere escalar', () => {
  assert.equal(sugerirEscalar({ llamadas: 1, correos: 0 }), false);
});
