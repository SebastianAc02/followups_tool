import test from 'node:test';
import assert from 'node:assert/strict';
import { urlNotion } from './notion-url.ts';

test('urlNotion arma la url canonica quitando guiones del page id', () => {
  assert.equal(urlNotion('11112222-3333-4444-5555-666677778888'), 'https://www.notion.so/11112222333344445555666677778888');
});
test('urlNotion devuelve null si no hay page id', () => {
  assert.equal(urlNotion(null), null);
});
