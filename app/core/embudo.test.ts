// app/core/embudo.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirEmbudo, CLAVE_SIN_ETAPA } from './embudo.ts';

// Captura de Sebastian (2026-07-15): el embudo mostraba "1100% ↓" entre CONTRATO (1) y
// CIERRE (11). Una etapa posterior once veces mas grande que la anterior no convirtio nada:
// son cuentas que saltaron etapas, que en un pipeline movido a mano es normal.
test('una etapa posterior mas grande que la anterior no reporta conversion', () => {
  const embudo = construirEmbudo([
    { estado: 'enviar_contrato', total: 1, usuarios: 6000 },
    { estado: 'cierre_documentacion', total: 11, usuarios: 43800 },
  ]);
  const contrato = embudo.bandas.find((b) => b.estado === 'enviar_contrato')!;
  const cierre = embudo.bandas.find((b) => b.estado === 'cierre_documentacion')!;
  assert.equal(contrato.total, 1);
  assert.equal(cierre.total, 11);
  assert.equal(cierre.conversionDesdeAnterior, null);
});

test('construirEmbudo: ordena bandas frio->caliente y calcula conversion vs anterior', () => {
  const embudo = construirEmbudo([
    { estado: 'lead', total: 100, usuarios: 1000 },
    { estado: 'contacto_iniciado', total: 50, usuarios: 400 },
    { estado: 'reunion_agendada', total: 25, usuarios: null },
    { estado: 'firma_pago', total: 10, usuarios: 200 },
    { estado: 'on_hold', total: 30, usuarios: null },
    { estado: CLAVE_SIN_ETAPA, total: 1437, usuarios: null },
  ]);

  assert.equal(embudo.bandas[0].estado, 'lead');
  assert.equal(embudo.bandas[0].conversionDesdeAnterior, null); // primera banda
  assert.equal(embudo.bandas[1].estado, 'contacto_iniciado');
  assert.equal(embudo.bandas[1].conversionDesdeAnterior, 50); // 50/100
  assert.equal(embudo.bandas[1].usuarios, 400);
  assert.equal(embudo.ganado.total, 10);
  assert.equal(embudo.onHold.total, 30);
  assert.equal(embudo.sinEtapa, 1437);
  // firma_pago y on_hold NO son bandas
  assert.ok(!embudo.bandas.some((b) => b.estado === 'firma_pago'));
  assert.ok(!embudo.bandas.some((b) => b.estado === 'on_hold'));
});

test('construirEmbudo: etapa sin conteo cae en 0, no desaparece', () => {
  const embudo = construirEmbudo([{ estado: 'lead', total: 5, usuarios: null }]);
  const reunion = embudo.bandas.find((b) => b.estado === 'reunion_agendada');
  assert.equal(reunion?.total, 0);
});
