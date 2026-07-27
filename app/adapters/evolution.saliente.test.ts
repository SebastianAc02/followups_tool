// Lo que SALE por la linea (2026-07-26). Hasta hoy el adaptador descartaba key.fromMe:true y
// la base guardaba 636 mensajes entrantes y ninguno de los que se mandaron: respuestas sin la
// pregunta que las provoco. Fixtures con el mismo shape real de Fase 0 (2026-07-09), con
// fromMe:true, que es como Evolution devuelve por webhook lo que uno mismo manda.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearMensajeSaliente, parsearMensajeEntrante } from './evolution.ts';

const salienteReal = {
  event: 'messages.upsert',
  instance: 'prueba',
  data: {
    key: {
      // En un upsert con fromMe:true el remoteJid sigue siendo el del OTRO lado del hilo:
      // es a quien le escribimos, no quien escribe.
      remoteJid: '573022482292@s.whatsapp.net',
      fromMe: true,
      id: 'BAE5F4A1C2D3E4F5',
    },
    status: 'PENDING',
    message: { conversation: 'Hola Andres, te escribo de OnePay: vi que Fibra Andina cobra por PSE' },
    messageType: 'conversation',
    messageTimestamp: 1783648200,
    instanceId: '2d927fee-33c9-48e3-b81d-16ff768eb99b',
  },
  date_time: '2026-07-09T22:50:00.000Z',
};

test('parsea un mensaje que mandamos nosotros (messages.upsert, fromMe:true)', () => {
  const m = parsearMensajeSaliente(salienteReal);
  assert.ok(m, 'deberia parsear');
  assert.equal(m.referenciaProveedor, 'prueba');
  assert.equal(m.telefono, '573022482292'); // el DESTINATARIO
  assert.equal(m.texto, 'Hola Andres, te escribo de OnePay: vi que Fibra Andina cobra por PSE');
  assert.equal(m.mensajeId, 'BAE5F4A1C2D3E4F5');
  assert.equal(m.fecha, new Date(1783648200 * 1000).toISOString());
});

// La razon por la que los dos parsers pueden convivir en el mismo endpoint sin orden de
// evaluacion delicado: ningun payload cae en los dos.
test('los dos parsers son excluyentes: el saliente descarta lo entrante y viceversa', () => {
  const entrante = { ...salienteReal, data: { ...salienteReal.data, key: { ...salienteReal.data.key, fromMe: false } } };
  assert.equal(parsearMensajeSaliente(entrante), null);
  assert.ok(parsearMensajeEntrante(entrante));
  assert.equal(parsearMensajeEntrante(salienteReal), null);
  assert.ok(parsearMensajeSaliente(salienteReal));
});

// Baileys puede no mandar la clave. Un undefined tratado como "no es mio" habria metido
// nuestros propios mensajes en la cola de "el ISP contesto", que es la que corta cadencias;
// tratado como "es mio" guardaria mensajes ajenos como copy nuestro. Ninguno de los dos: se
// descarta, porque de verdad no se sabe quien lo mando.
test('sin key.fromMe no lo toma ninguno de los dos parsers', () => {
  const key = { remoteJid: salienteReal.data.key.remoteJid, id: salienteReal.data.key.id };
  const ambiguo = { ...salienteReal, data: { ...salienteReal.data, key } };
  assert.equal(parsearMensajeSaliente(ambiguo), null);
  assert.equal(parsearMensajeEntrante(ambiguo), null);
});

test('descarta acuses de lectura y otros eventos que no son messages.upsert', () => {
  assert.equal(parsearMensajeSaliente({ ...salienteReal, event: 'messages.update' }), null);
  assert.equal(parsearMensajeSaliente({ event: 'connection.update', instance: 'prueba', data: {} }), null);
  assert.equal(parsearMensajeSaliente(null), null);
});

// v1 solo texto, igual que el entrante: un audio o una imagen que sale no se guarda como copy
// vacio. Se prefiere no tener la fila a tener una que diga que se mando un mensaje en blanco.
test('descarta lo que sale sin texto (audio, imagen, sticker)', () => {
  const audio = { ...salienteReal, data: { ...salienteReal.data, message: { audioMessage: { url: 'x' } }, messageType: 'audioMessage' } };
  assert.equal(parsearMensajeSaliente(audio), null);
});

test('toma el texto de un extendedTextMessage (reply citado o con link preview)', () => {
  const conLink = {
    ...salienteReal,
    data: { ...salienteReal.data, message: { extendedTextMessage: { text: 'Te dejo el link: onepay.com.co' } } },
  };
  const m = parsearMensajeSaliente(conLink);
  assert.equal(m?.texto, 'Te dejo el link: onepay.com.co');
});
