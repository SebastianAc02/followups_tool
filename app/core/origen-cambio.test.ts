// De donde vino el cambio de etapa decide si se devuelve a Notion. Los dos casos explicitos
// son la razon de ser del archivo: reconciliar (el dato ya estaba en Notion) no debe rebotar,
// mover desde la herramienta si debe avisar. El bounce-back que esto evita es
// Notion -> DB -> Notion, que escribe sobre el CRM de otra persona sin cambiar nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { debeEncolarHaciaNotion, ORIGENES_CAMBIO } from './origen-cambio.ts';

test('origen notion NO encola: el dato ya estaba en Notion, devolverlo es el bounce-back', () => {
  assert.equal(debeEncolarHaciaNotion('notion'), false);
});

test('origen herramienta SI encola: el cambio nacio aca y el CRM espejo debe enterarse', () => {
  assert.equal(debeEncolarHaciaNotion('herramienta'), true);
});

test('ORIGENES_CAMBIO son exactamente los dos que el zod del MCP acepta', () => {
  assert.deepEqual([...ORIGENES_CAMBIO], ['notion', 'herramienta']);
});

// El default es lo que de verdad hay que blindar: es invisible en las dos direcciones, asi que
// sin este test alguien lo cambia y nadie se entera hasta que aparezca una escritura sobre el
// CRM de otra persona. Decision de Sebastian el 2026-07-25: nada sale a Notion automatico.
test('sin origen NO encola: hoy nada sale hacia Notion de forma automatica', () => {
  assert.equal(debeEncolarHaciaNotion(undefined), false);
});

test('encolar es opt-in explicito, nunca por descuido', () => {
  // @ts-expect-error -- un valor fuera del enum no debe colarse como "encola"
  assert.equal(debeEncolarHaciaNotion('cualquier-otra-cosa'), false);
});
