// V4.2: pruebas del parser puro (sin DB). Cubre CSV con comillas/multilinea, Markdown
// con encabezado por dia/canal/asunto, orden inferido, y errores estructurales.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearCadenciaCsv, parsearCadenciaMarkdown, parsearCadenciaJson } from './cadencia-parser.ts';

test('CSV: encabezado + pasos, orden explicito, columnas en cualquier orden', () => {
  const csv = [
    'orden,dia_offset,canal,asunto,cuerpo',
    '1,0,correo,Primer toque,Hola queria presentarme',
    '2,3,whatsapp,,Segui por aca',
  ].join('\n');

  const cad = parsearCadenciaCsv(csv, { nombre: 'ISP outbound', descripcion: 'cadencia de prueba' });

  assert.equal(cad.nombre, 'ISP outbound');
  assert.equal(cad.descripcion, 'cadencia de prueba');
  assert.equal(cad.pasos.length, 2);
  assert.deepEqual(cad.pasos[0], {
    orden: 1,
    diaOffset: 0,
    canal: 'correo',
    asunto: 'Primer toque',
    cuerpo: 'Hola queria presentarme',
    objetivo: undefined,
    variables: [],
    firmaApollo: false,
  });
  assert.equal(cad.pasos[1].asunto, undefined, 'asunto vacio en whatsapp queda undefined');
  assert.equal(cad.pasos[1].canal, 'whatsapp');
});

test('CSV: comas y saltos de linea dentro de comillas no rompen el cuerpo', () => {
  const csv = 'dia_offset,canal,cuerpo\n0,correo,"Hola, buen dia.\nQueria contarte algo.\nGracias"';
  const cad = parsearCadenciaCsv(csv, { nombre: 'X' });
  assert.equal(cad.pasos.length, 1);
  assert.equal(cad.pasos[0].cuerpo, 'Hola, buen dia.\nQueria contarte algo.\nGracias');
  assert.equal(cad.pasos[0].orden, 1, 'sin columna orden, se infiere por posicion');
});

test('CSV: comilla doble escapada ("") se vuelve una comilla literal', () => {
  const csv = 'dia_offset,canal,cuerpo\n0,correo,"Dijo ""hola"" y se fue"';
  const cad = parsearCadenciaCsv(csv, { nombre: 'X' });
  assert.equal(cad.pasos[0].cuerpo, 'Dijo "hola" y se fue');
});

test('CSV: offset no numerico lanza error estructural con contexto de fila', () => {
  const csv = 'dia_offset,canal\nabc,correo';
  assert.throws(() => parsearCadenciaCsv(csv, { nombre: 'X' }), /dia_offset.*fila 2/);
});

test('CSV: sin columnas minimas (dia_offset, canal) lanza', () => {
  const csv = 'foo,bar\n1,2';
  assert.throws(() => parsearCadenciaCsv(csv, { nombre: 'X' }), /dia_offset y canal/);
});

test('Markdown: titulo + descripcion + pasos por dia/canal/asunto, orden inferido', () => {
  const md = [
    '# Cadencia ISP',
    'Esta es la descripcion',
    'en dos lineas',
    '',
    '## Día 0 · correo · Me presento',
    'Hola, soy Sebastian.',
    'Trabajo con ISPs.',
    '',
    '## Día 3 · whatsapp',
    'Segui por aca, avisame.',
  ].join('\n');

  const cad = parsearCadenciaMarkdown(md);

  assert.equal(cad.nombre, 'Cadencia ISP');
  assert.equal(cad.descripcion, 'Esta es la descripcion\nen dos lineas');
  assert.equal(cad.pasos.length, 2);
  assert.deepEqual(cad.pasos[0], {
    orden: 1,
    diaOffset: 0,
    canal: 'correo',
    asunto: 'Me presento',
    cuerpo: 'Hola, soy Sebastian.\nTrabajo con ISPs.',
    variables: [],
    firmaApollo: false,
  });
  assert.deepEqual(cad.pasos[1], {
    orden: 2,
    diaOffset: 3,
    canal: 'whatsapp',
    asunto: undefined,
    cuerpo: 'Segui por aca, avisame.',
    variables: [],
    firmaApollo: false,
  });
});

// Parte 3 campanas: personalizacion ([variable]) y firma Apollo ([[firma]]).
test('Markdown: [variable] se detecta y NO se borra del cuerpo (se muestra resaltada en la UI)', () => {
  const md = ['# C', '## Día 0 · correo · Hola [nombre]', 'Hola [nombre], somos de [empresa_propia].'].join('\n');
  const cad = parsearCadenciaMarkdown(md);
  assert.equal(cad.pasos[0].cuerpo, 'Hola [nombre], somos de [empresa_propia].');
  assert.deepEqual(cad.pasos[0].variables, ['nombre', 'empresa_propia']);
});

test('Markdown: variable repetida en asunto y cuerpo aparece una sola vez', () => {
  const md = ['# C', '## Día 0 · correo · Hola [nombre]', 'Que tal, [nombre].'].join('\n');
  const cad = parsearCadenciaMarkdown(md);
  assert.deepEqual(cad.pasos[0].variables, ['nombre']);
});

test('Markdown: [[firma]] activa firmaApollo y se quita del cuerpo (no es variable)', () => {
  const md = ['# C', '## Día 0 · correo · Asunto', 'Cuerpo del correo.', '[[firma]]'].join('\n');
  const cad = parsearCadenciaMarkdown(md);
  assert.equal(cad.pasos[0].firmaApollo, true);
  assert.equal(cad.pasos[0].cuerpo, 'Cuerpo del correo.');
  assert.deepEqual(cad.pasos[0].variables, []);
});

test('Markdown: sin [[firma]] el paso nace firmaApollo=false', () => {
  const md = ['# C', '## Día 0 · correo · Asunto', 'Cuerpo sin firma.'].join('\n');
  const cad = parsearCadenciaMarkdown(md);
  assert.equal(cad.pasos[0].firmaApollo, false);
});

test('CSV: tambien detecta variables y firma en asunto/cuerpo', () => {
  const csv = 'dia_offset,canal,asunto,cuerpo\n0,correo,Hola [nombre],"Cuerpo [nombre].\n[[firma]]"';
  const cad = parsearCadenciaCsv(csv, { nombre: 'X' });
  assert.deepEqual(cad.pasos[0].variables, ['nombre']);
  assert.equal(cad.pasos[0].firmaApollo, true);
  assert.equal(cad.pasos[0].cuerpo, 'Cuerpo [nombre].');
});

test('Markdown: acepta "|" como separador ademas de "·"', () => {
  const md = '# C\n## Dia 5 | correo | Asunto\nCuerpo';
  const cad = parsearCadenciaMarkdown(md);
  assert.equal(cad.pasos[0].diaOffset, 5);
  assert.equal(cad.pasos[0].canal, 'correo');
  assert.equal(cad.pasos[0].asunto, 'Asunto');
});

test('Markdown: sin titulo lanza', () => {
  assert.throws(() => parsearCadenciaMarkdown('## Día 0 · correo\nx'), /titulo de cadencia/);
});

test('Markdown: paso sin canal lanza', () => {
  assert.throws(() => parsearCadenciaMarkdown('# C\n## Día 0\nx'), /sin canal/);
});

// Parte 3 campanas (Fase 3): parser JSON, mismo tratamiento de copy que CSV/Markdown.
test('parsearCadenciaJson lee pasos y extrae variables', () => {
  const json = JSON.stringify({
    nombre: 'Pasarela ISP Valle',
    pasos: [{ diaOffset: 0, canal: 'correo', asunto: 'Pagos más simples para [empresa]', cuerpo: 'Hola [nombre]' }],
  });
  const c = parsearCadenciaJson(json);
  assert.equal(c.nombre, 'Pasarela ISP Valle');
  assert.equal(c.pasos[0].canal, 'correo');
  assert.deepEqual(c.pasos[0].variables, ['empresa', 'nombre']);
});

test('JSON: orden se auto-numera por posicion cuando no viene en el paso', () => {
  const json = JSON.stringify({
    nombre: 'C',
    pasos: [
      { diaOffset: 0, canal: 'correo', cuerpo: 'Uno' },
      { diaOffset: 3, canal: 'whatsapp', cuerpo: 'Dos' },
    ],
  });
  const c = parsearCadenciaJson(json);
  assert.equal(c.pasos[0].orden, 1);
  assert.equal(c.pasos[1].orden, 2);
});

test('JSON: respeta descripcion opcional y [[firma]] en el cuerpo', () => {
  const json = JSON.stringify({
    nombre: 'C',
    descripcion: 'desc',
    pasos: [{ diaOffset: 0, canal: 'correo', cuerpo: 'Cuerpo.\n[[firma]]' }],
  });
  const c = parsearCadenciaJson(json);
  assert.equal(c.descripcion, 'desc');
  assert.equal(c.pasos[0].firmaApollo, true);
  assert.equal(c.pasos[0].cuerpo, 'Cuerpo.');
});

test('JSON: texto invalido (no parseable) lanza error estructural', () => {
  assert.throws(() => parsearCadenciaJson('{ no es json'), /JSON/);
});

test('JSON: sin nombre o sin pasos lanza error estructural', () => {
  assert.throws(() => parsearCadenciaJson(JSON.stringify({ pasos: [{ diaOffset: 0, canal: 'correo' }] })), /nombre/);
  assert.throws(() => parsearCadenciaJson(JSON.stringify({ nombre: 'C', pasos: [] })), /paso/);
});

test('JSON: paso sin diaOffset o sin canal lanza error estructural', () => {
  assert.throws(() => parsearCadenciaJson(JSON.stringify({ nombre: 'C', pasos: [{ canal: 'correo' }] })), /dia_offset|diaOffset/);
  assert.throws(() => parsearCadenciaJson(JSON.stringify({ nombre: 'C', pasos: [{ diaOffset: 0 }] })), /canal/);
});
