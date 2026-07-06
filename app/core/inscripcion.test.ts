// V4.5: pruebas del selector de destinatario default (B1.b), puro sin DB.

import test from 'node:test';
import assert from 'node:assert/strict';
import { elegirDestinatarioDefault, type ContactoCandidato } from './inscripcion.ts';

const c = (over: Partial<ContactoCandidato> & { idContacto: number }): ContactoCandidato => ({
  esKeyDecisionMaker: false,
  esPrincipal: false,
  email: null,
  ...over,
});

test('KDM con email gana sobre principal y sobre el primero', () => {
  const contactos = [
    c({ idContacto: 1, esPrincipal: true, email: 'ppal@x.com' }),
    c({ idContacto: 2, esKeyDecisionMaker: true, email: 'kdm@x.com' }),
    c({ idContacto: 3, email: 'otro@x.com' }),
  ];
  assert.equal(elegirDestinatarioDefault(contactos), 2);
});

test('sin KDM con email, gana el principal con email', () => {
  const contactos = [
    c({ idContacto: 1, email: 'primero@x.com' }),
    c({ idContacto: 2, esPrincipal: true, email: 'ppal@x.com' }),
  ];
  assert.equal(elegirDestinatarioDefault(contactos), 2);
});

test('sin KDM ni principal con email, gana el primero con email (por orden)', () => {
  const contactos = [
    c({ idContacto: 5, email: null }),
    c({ idContacto: 6, email: 'seis@x.com' }),
    c({ idContacto: 7, email: 'siete@x.com' }),
  ];
  assert.equal(elegirDestinatarioDefault(contactos), 6);
});

test('el KDM sin email NO gana: se prefiere quien SI tiene email', () => {
  const contactos = [
    c({ idContacto: 1, esKeyDecisionMaker: true, email: null }),
    c({ idContacto: 2, esPrincipal: true, email: 'ppal@x.com' }),
  ];
  assert.equal(elegirDestinatarioDefault(contactos), 2);
});

test('ningun contacto con email -> null (inscripcion bloqueada)', () => {
  const contactos = [c({ idContacto: 1, esKeyDecisionMaker: true, email: null }), c({ idContacto: 2, email: '  ' })];
  assert.equal(elegirDestinatarioDefault(contactos), null);
});

test('sin contactos -> null', () => {
  assert.equal(elegirDestinatarioDefault([]), null);
});
