// motivosNoSale: por qué un paso no sale. Lo que este archivo fija es que cada gate real tenga
// su frase propia, porque el valor entero de la función es que el mensaje mande a mirar el lugar
// correcto. Un motivo genérico ("no elegible") no sirve para nada: eso ya lo dice la lista.
import test from 'node:test';
import assert from 'node:assert/strict';
import { motivosNoSale, type EstadoEmpujon } from './empujon.ts';

const AHORA = '2026-07-28T20:00:00.000Z';

function base(over: Partial<EstadoEmpujon> = {}): EstadoEmpujon {
  return {
    estadoPaso: 'pendiente',
    canal: 'correo',
    esManual: false,
    aprobadoEn: null,
    intentos: 0,
    proximoIntento: null,
    fechaProgramada: '2026-07-28T10:00:00.000Z',
    estadoCampana: 'activa',
    estadoInscripcion: 'activa',
    estadoDestinatario: 'activo',
    proveedorCampanaId: 'gmail-camp-58',
    aprobadaEnvioGmail: true,
    proveedorCorreo: 'gmail',
    email: 'destino@ejemplo.com',
    telefono: null,
    lineaWhatsappDelOwner: false,
    ...over,
  };
}

test('un paso de correo sano no tiene ni un motivo: la función no inventa problemas', () => {
  assert.deepEqual(motivosNoSale(base(), AHORA, 5), []);
});

test('programado para más adelante: dice la fecha Y dice que adelantar lo arregla', () => {
  const m = motivosNoSale(base({ fechaProgramada: '2026-07-29T13:00:00.000Z' }), AHORA, 5);
  assert.equal(m.length, 1);
  assert.match(m[0], /2026-07-29T13:00:00.000Z/);
  assert.match(m[0], /adelantar: true/, 'el motivo tiene que decir qué hacer, no sólo qué pasa');
});

test('campaña que no está activa: el motivo apunta a la campaña, no al paso', () => {
  assert.match(motivosNoSale(base({ estadoCampana: 'pausada' }), AHORA, 5).join(' '), /la campaña está en 'pausada'/);
  assert.match(motivosNoSale(base({ estadoCampana: 'borrador' }), AHORA, 5).join(' '), /la campaña está en 'borrador'/);
});

test('aprobada_envio_gmail=0 sólo muerde si la campaña manda por Gmail', () => {
  assert.match(
    motivosNoSale(base({ aprobadaEnvioGmail: false }), AHORA, 5).join(' '),
    /aprobada_envio_gmail/,
    'con Gmail el gate corta y la fila se queda pendiente para siempre',
  );
  assert.deepEqual(
    motivosNoSale(base({ aprobadaEnvioGmail: false, proveedorCorreo: 'apollo' }), AHORA, 5),
    [],
    'por Apollo ese gate no existe: reportarlo mandaría a apagar algo que no es',
  );
});

test('proveedor_campana_id en NULL: un correo sin eso ni entra a la cola', () => {
  assert.match(motivosNoSale(base({ proveedorCampanaId: null }), AHORA, 5).join(' '), /proveedor_campana_id/);
});

test('WhatsApp sin aprobar: el gate de revisión humana se nombra y se dice que NO se salta', () => {
  const m = motivosNoSale(base({ canal: 'whatsapp', telefono: '573001112233', email: null, proveedorCorreo: null, lineaWhatsappDelOwner: true }), AHORA, 5);
  assert.equal(m.length, 1);
  assert.match(m[0], /revisión humana/);
  assert.match(m[0], /NO se salta/);
});

test('WhatsApp aprobado pero el dueño sin línea activa: la fila se salta entera y eso se dice', () => {
  const m = motivosNoSale(
    base({ canal: 'whatsapp', telefono: '573001112233', email: null, proveedorCorreo: null, aprobadoEn: AHORA, lineaWhatsappDelOwner: false }),
    AHORA,
    5,
  );
  assert.match(m.join(' '), /línea de WhatsApp activa/);
  assert.match(m.join(' '), /sin dejar rastro/);
});

test('es_manual sin aprobar se dice distinto del gate de WhatsApp: son dos cosas y una se puede apagar', () => {
  const m = motivosNoSale(base({ esManual: true }), AHORA, 5);
  assert.equal(m.length, 1);
  assert.match(m[0], /es_manual=1/);
});

test('backoff e intentos agotados son motivos distintos y traen el número', () => {
  assert.match(motivosNoSale(base({ estadoPaso: 'fallo', intentos: 2, proximoIntento: '2026-07-28T23:00:00.000Z' }), AHORA, 5).join(' '), /backoff hasta 2026-07-28T23:00/);
  assert.match(motivosNoSale(base({ estadoPaso: 'fallo', intentos: 5 }), AHORA, 5).join(' '), /agotó los 5 intentos/);
});

test("un paso en 'enviando' se explica como proceso caído, no como 'no le toca'", () => {
  assert.match(motivosNoSale(base({ estadoPaso: 'enviando' }), AHORA, 5).join(' '), /se cayó entre marcarlo y recibir la respuesta/);
});

test('llamada nunca sale por empujón, y el motivo dice cómo se cierra de verdad', () => {
  const m = motivosNoSale(base({ canal: 'llamada', proveedorCorreo: null, telefono: '3001112233' }), AHORA, 5);
  assert.match(m.join(' '), /no tiene proveedor automático/);
  assert.match(m.join(' '), /registrar el toque/);
});

test('un contacto sin email en un paso de correo: no hay a dónde mandarlo', () => {
  assert.match(motivosNoSale(base({ email: null }), AHORA, 5).join(' '), /no tiene email/);
});
