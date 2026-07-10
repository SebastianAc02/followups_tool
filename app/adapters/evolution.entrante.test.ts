// Tarea 5/6: parseo del webhook entrante de Evolution. Fixtures modelados contra el
// payload REAL capturado en vivo (Fase 0, 2026-07-09, instancia 'prueba'). El caso
// entrante (fromMe:false) es el mismo shape real con el campo fromMe flipeado -- Fase 0
// confirmo que un mensaje recibido llega con fromMe:false (FASE0-ESTADO.md C2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearMensajeEntrante } from './evolution.ts';

// Payload real 'messages.upsert' (conversation), con fromMe:false = respuesta entrante.
const entranteReal = {
  event: 'messages.upsert',
  instance: 'prueba',
  data: {
    key: {
      remoteJid: '573022482292@s.whatsapp.net',
      fromMe: false,
      id: '2ACFB663C575C932C4BE',
    },
    pushName: 'Cliente Prueba',
    status: 'SERVER_ACK',
    message: { conversation: 'Si me interesa, cuentame mas' },
    messageType: 'conversation',
    messageTimestamp: 1783648298,
    instanceId: '2d927fee-33c9-48e3-b81d-16ff768eb99b',
  },
  date_time: '2026-07-09T22:51:38.586Z',
  sender: '573105182997@s.whatsapp.net',
};

test('parsea una respuesta entrante real (messages.upsert, fromMe:false)', () => {
  const m = parsearMensajeEntrante(entranteReal);
  assert.ok(m, 'deberia parsear');
  assert.equal(m.referenciaProveedor, 'prueba');
  assert.equal(m.telefono, '573022482292'); // sin @s.whatsapp.net, solo digitos
  assert.equal(m.texto, 'Si me interesa, cuentame mas');
  assert.equal(m.mensajeId, '2ACFB663C575C932C4BE');
  assert.equal(m.fecha, new Date(1783648298 * 1000).toISOString());
});

test('descarta lo que mandamos nosotros (fromMe:true)', () => {
  const propio = { ...entranteReal, data: { ...entranteReal.data, key: { ...entranteReal.data.key, fromMe: true } } };
  assert.equal(parsearMensajeEntrante(propio), null);
});

test('descarta acuses de entrega (messages.update)', () => {
  const update = {
    event: 'messages.update',
    instance: 'prueba',
    data: { keyId: '2ACFB663C575C932C4BE', remoteJid: '100631654199312@lid', fromMe: true, status: 'DELIVERY_ACK' },
  };
  assert.equal(parsearMensajeEntrante(update), null);
});

test('descarta connection.update', () => {
  assert.equal(parsearMensajeEntrante({ event: 'connection.update', instance: 'prueba', data: { state: 'open' } }), null);
});

test('descarta un mensaje sin texto (imagen/sticker/audio)', () => {
  const imagen = {
    ...entranteReal,
    data: { ...entranteReal.data, message: { imageMessage: { url: 'x' } }, messageType: 'imageMessage' },
  };
  assert.equal(parsearMensajeEntrante(imagen), null);
});

test('soporta extendedTextMessage (reply citado / con link)', () => {
  const reply = {
    ...entranteReal,
    data: { ...entranteReal.data, message: { extendedTextMessage: { text: 'Dale, hablemos' } }, messageType: 'extendedTextMessage' },
  };
  const m = parsearMensajeEntrante(reply);
  assert.ok(m);
  assert.equal(m.texto, 'Dale, hablemos');
});

test('entrada basura no tira, devuelve null', () => {
  assert.equal(parsearMensajeEntrante(null), null);
  assert.equal(parsearMensajeEntrante('no soy json'), null);
  assert.equal(parsearMensajeEntrante({ event: 'messages.upsert' }), null); // sin data
});
