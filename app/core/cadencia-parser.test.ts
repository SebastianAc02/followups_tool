// V4.2: pruebas del parser puro (sin DB). Cubre CSV con comillas/multilinea, Markdown
// con encabezado por dia/canal/asunto, orden inferido, y errores estructurales.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearCadenciaCsv, parsearCadenciaMarkdown } from './cadencia-parser.ts';

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
  assert.deepEqual(cad.pasos[0], { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Primer toque', cuerpo: 'Hola queria presentarme', objetivo: undefined });
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
  assert.deepEqual(cad.pasos[0], { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Me presento', cuerpo: 'Hola, soy Sebastian.\nTrabajo con ISPs.' });
  assert.deepEqual(cad.pasos[1], { orden: 2, diaOffset: 3, canal: 'whatsapp', asunto: undefined, cuerpo: 'Segui por aca, avisame.' });
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
