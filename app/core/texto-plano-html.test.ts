import test from 'node:test';
import assert from 'node:assert/strict';
import { textoPlanoAHtml } from './texto-plano-html.ts';

test('una línea sola es un párrafo sin <br> de más', () => {
  assert.equal(textoPlanoAHtml('Hola Sandra'), '<p>Hola Sandra</p>');
});

test('un salto simple dentro de un párrafo se vuelve <br>', () => {
  assert.equal(textoPlanoAHtml('línea 1\nlínea 2'), '<p>línea 1<br>línea 2</p>');
});

test('una línea en blanco separa párrafos', () => {
  assert.equal(textoPlanoAHtml('párrafo 1\n\npárrafo 2'), '<p>párrafo 1</p><p>párrafo 2</p>');
});

test('dos o más líneas en blanco seguidas cuentan como un solo separador de párrafo', () => {
  assert.equal(textoPlanoAHtml('a\n\n\nb'), '<p>a</p><p>b</p>');
});

test('una lista con guion se preserva como líneas dentro del mismo párrafo, sin <ul>', () => {
  const texto = 'Dos fechas:\n- Miércoles 2, 10am\n- Jueves 3, 2pm';
  assert.equal(textoPlanoAHtml(texto), '<p>Dos fechas:<br>- Miércoles 2, 10am<br>- Jueves 3, 2pm</p>');
});

test('escapa &, < y > antes de insertar cualquier tag', () => {
  assert.equal(
    textoPlanoAHtml('POST /invoices <ver doc> & webhook'),
    '<p>POST /invoices &lt;ver doc&gt; &amp; webhook</p>',
  );
});
