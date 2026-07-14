import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canalesDisponiblesKDM, estaEnPBX } from './pbx.ts';

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
