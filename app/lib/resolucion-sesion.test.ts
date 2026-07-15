import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverMembresia } from './resolucion-sesion.ts';

test('resolverMembresia devuelve sin-membresia cuando no hay fila (rescatar, no lanzar)', () => {
  const r = resolverMembresia(undefined);
  assert.equal(r.tipo, 'sin-membresia');
});

test('resolverMembresia resuelve una organizacion normal sin solo lectura', () => {
  const r = resolverMembresia({ idOrganizacion: 3, nombreOrganizacion: 'Onepay', nombreDisplay: 'Ana', ownerCanonico: 'Ana' });
  assert.deepEqual(r, { tipo: 'ok', idOrganizacion: 3, soloLectura: false });
});

test('resolverMembresia manda a un visitante a Onepay (id 1) en solo lectura', () => {
  const r = resolverMembresia({ idOrganizacion: 99, nombreOrganizacion: 'Visitantes', nombreDisplay: 'Juan', ownerCanonico: 'Juan' });
  assert.deepEqual(r, { tipo: 'ok', idOrganizacion: 1, soloLectura: true });
});
