import test from 'node:test';
import assert from 'node:assert/strict';
import { reescribirLinksClic, inyectarPixelApertura } from './tracking-links.ts';

const PARAMS = { baseUrl: 'https://app.onepay.example', proveedorCampanaId: 'seq-123' };

test('reescribirLinksClic reescribe un link http(s) para pasar por /api/track/click, con {{email}} literal (sin encodear)', () => {
  const out = reescribirLinksClic('<a href="https://calendly.com/agenda">Agenda aquí</a>', PARAMS);
  assert.equal(
    out,
    '<a href="https://app.onepay.example/api/track/click?c=seq-123&e={{email}}&u=https%3A%2F%2Fcalendly.com%2Fagenda">Agenda aquí</a>',
  );
});

test('reescribirLinksClic reescribe VARIOS links, cada uno con su propia url de destino', () => {
  const out = reescribirLinksClic(
    '<a href="https://a.com/uno">A</a> texto <a href="https://b.com/dos">B</a>',
    PARAMS,
  );
  assert.match(out, /u=https%3A%2F%2Fa\.com%2Funo/);
  assert.match(out, /u=https%3A%2F%2Fb\.com%2Fdos/);
});

test('reescribirLinksClic NO toca mailto:, tel: ni anclas', () => {
  const original = '<a href="mailto:x@y.com">Escríbeme</a> <a href="tel:+573000000000">Llama</a> <a href="#seccion">Ir</a>';
  assert.equal(reescribirLinksClic(original, PARAMS), original);
});

test('reescribirLinksClic con cuerpo vacío o solo espacios no hace nada', () => {
  assert.equal(reescribirLinksClic('', PARAMS), '');
  assert.equal(reescribirLinksClic('   ', PARAMS), '   ');
});

test('inyectarPixelApertura agrega un <img> de 1x1 invisible al final del cuerpo, con {{email}} literal', () => {
  const out = inyectarPixelApertura('<p>Hola [nombre]</p>', PARAMS);
  assert.ok(out.startsWith('<p>Hola [nombre]</p>'));
  assert.match(out, /<img src="https:\/\/app\.onepay\.example\/api\/track\/open\?c=seq-123&e=\{\{email\}\}" width="1" height="1" alt="" style="display:none" \/>$/);
});

test('inyectarPixelApertura con cuerpo vacío no agrega nada (sin copy no hay a que pegarle un pixel)', () => {
  assert.equal(inyectarPixelApertura('', PARAMS), '');
});

test('reescribirLinksClic + inyectarPixelApertura componen sin pisarse (el pixel no es un <a href>, la regex de clic no lo toca)', () => {
  const conLinks = reescribirLinksClic('<a href="https://x.com">X</a>', PARAMS);
  const final = inyectarPixelApertura(conLinks, PARAMS);
  assert.match(final, /\/api\/track\/click\?/);
  assert.match(final, /\/api\/track\/open\?/);
});
