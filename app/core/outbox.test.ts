import test from 'node:test';
import assert from 'node:assert/strict';
import { drenarOutbox, calcularProximoIntento, MAX_INTENTOS, type FilaOutbox, type OutboxDeps } from './outbox.ts';
import type { SyncAdapter } from './ports/sync.ts';

function notionFalso(): SyncAdapter & { llamadas: unknown[] } {
  const llamadas: unknown[] = [];
  return {
    llamadas,
    async actualizarPagina(cambio) {
      llamadas.push(cambio);
    },
  };
}

function notionQueFalla(): SyncAdapter {
  return {
    async actualizarPagina() {
      throw new Error('fallo de red simulado');
    },
  };
}

function depsFalsos(filaInicial: FilaOutbox | null) {
  let fila: FilaOutbox | null = filaInicial;
  const enviados: number[] = [];
  const fallidos: { idOutbox: number; intentos: number; proximoIntento: string | null }[] = [];
  const deps: OutboxDeps = {
    pendientes: () => (fila ? [fila] : []),
    marcarEnviado: (idOutbox) => {
      enviados.push(idOutbox);
      fila = null; // ya no es pendiente
    },
    marcarFallido: (idOutbox, intentos, proximoIntento) => {
      fallidos.push({ idOutbox, intentos, proximoIntento });
      fila = { ...(fila as FilaOutbox), intentos };
    },
  };
  return { deps, enviados, fallidos };
}

test('drenar dos veces manda a Notion UNA vez', async () => {
  const notion = notionFalso();
  const { deps } = depsFalsos({ idOutbox: 1, payload: { notionPageId: 'page-1', proximoPaso: 'llamar' }, intentos: 0 });

  await drenarOutbox(deps, notion);
  await drenarOutbox(deps, notion);

  assert.strictEqual(notion.llamadas.length, 1);
});

test('fallo de red deja la fila pendiente con reintento programado', async () => {
  const notion = notionQueFalla();
  const { deps, fallidos } = depsFalsos({ idOutbox: 1, payload: { notionPageId: 'page-1', proximoPaso: 'llamar' }, intentos: 0 });

  await drenarOutbox(deps, notion, new Date('2026-07-06T10:00:00.000Z'));

  assert.strictEqual(fallidos.length, 1);
  assert.strictEqual(fallidos[0].intentos, 1);
  assert.ok(fallidos[0].proximoIntento);
});

test('tras agotar MAX_INTENTOS, no se programa mas reintento (null = fallido definitivo)', async () => {
  const notion = notionQueFalla();
  const { deps, fallidos } = depsFalsos({ idOutbox: 1, payload: { notionPageId: 'page-1' }, intentos: MAX_INTENTOS - 1 });

  await drenarOutbox(deps, notion);

  assert.strictEqual(fallidos[0].intentos, MAX_INTENTOS);
  assert.strictEqual(fallidos[0].proximoIntento, null);
});

test('calcularProximoIntento crece y tiene tope (no crece sin limite)', () => {
  const ahora = new Date('2026-07-06T10:00:00.000Z');
  const t1 = calcularProximoIntento(1, ahora).getTime() - ahora.getTime();
  const t5 = calcularProximoIntento(5, ahora).getTime() - ahora.getTime();
  const t99 = calcularProximoIntento(99, ahora).getTime() - ahora.getTime();
  assert.ok(t1 < t5);
  assert.strictEqual(t5, t99); // tope: intentos mas alla del ultimo escalon no siguen creciendo
});
