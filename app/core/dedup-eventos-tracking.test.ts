import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparDuplicados, VENTANA_DEDUP_MS, type EventoParaDedup } from './dedup-eventos-tracking.ts';

function evento(over: Partial<EventoParaDedup> & { id_evento: number }): EventoParaDedup {
  return {
    id_paso_inscripcion: 113,
    tipo: 'abierto',
    fecha_evento: '2026-07-27T20:29:56.581Z',
    ip: null,
    ...over,
  };
}

test('caso canonico: eventos 8 y 9 (5ms de distancia, paso 113, abierto) se agrupan; el evento 6 (2min22s antes) queda separado', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 6, fecha_evento: '2026-07-27T20:27:34.221Z' }),
    evento({ id_evento: 8, fecha_evento: '2026-07-27T20:29:56.581Z' }),
    evento({ id_evento: 9, fecha_evento: '2026-07-27T20:29:56.586Z' }),
  ];
  const resultado = agruparDuplicados(eventos);

  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(6)!.grupo_dedup_id, 6);
  assert.strictEqual(porId.get(6)!.es_representante_grupo, true);
  assert.strictEqual(porId.get(8)!.grupo_dedup_id, 8);
  assert.strictEqual(porId.get(8)!.es_representante_grupo, true);
  assert.strictEqual(porId.get(9)!.grupo_dedup_id, 8);
  assert.strictEqual(porId.get(9)!.es_representante_grupo, false);

  const gruposDistintos = new Set(resultado.map((r) => r.grupo_dedup_id));
  assert.strictEqual(gruposDistintos.size, 2, 'paso 113 tipo abierto tiene que quedar en 2 aperturas agrupadas, no 3 ni 1');
});

test('lista vacia devuelve lista vacia', () => {
  assert.deepStrictEqual(agruparDuplicados([]), []);
});

test('un solo evento es su propio grupo y es representante', () => {
  const resultado = agruparDuplicados([evento({ id_evento: 1 })]);
  assert.deepStrictEqual(resultado, [{ id_evento: 1, grupo_dedup_id: 1, es_representante_grupo: true }]);
});

test('mismo paso, mismo instante, tipos distintos: no se agrupan entre si', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 1, tipo: 'abierto', fecha_evento: '2026-07-29T07:16:51.747Z' }),
    evento({ id_evento: 2, tipo: 'clic', fecha_evento: '2026-07-29T07:16:51.748Z' }),
  ];
  const resultado = agruparDuplicados(eventos);
  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(1)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(2)!.grupo_dedup_id, 2);
});

test('mismo tipo, mismo instante, pasos de inscripcion distintos: no se agrupan aunque coincidan en tiempo', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 1, id_paso_inscripcion: 114, fecha_evento: '2026-07-29T07:17:11.372Z' }),
    evento({ id_evento: 2, id_paso_inscripcion: 115, fecha_evento: '2026-07-29T07:17:11.373Z' }),
  ];
  const resultado = agruparDuplicados(eventos);
  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(1)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(2)!.grupo_dedup_id, 2);
});

test('desempate por ip: dentro de la ventana pero ips distintas no nulas, son dos dispositivos y no se agrupan', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 1, fecha_evento: '2026-07-27T20:29:56.581Z', ip: '74.125.210.129' }),
    evento({ id_evento: 2, fecha_evento: '2026-07-27T20:29:56.700Z', ip: '181.58.39.167' }),
  ];
  const resultado = agruparDuplicados(eventos);
  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(1)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(2)!.grupo_dedup_id, 2);
});

test('desempate por ip no aplica si a alguno le falta la ip: solo pesan tiempo, paso y tipo (eventos viejos sin huella)', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 1, fecha_evento: '2026-07-27T20:29:56.581Z', ip: null }),
    evento({ id_evento: 2, fecha_evento: '2026-07-27T20:29:56.700Z', ip: '74.125.210.129' }),
  ];
  const resultado = agruparDuplicados(eventos);
  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(1)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(2)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(2)!.es_representante_grupo, false);
});

test('ip misma en los dos: se agrupan (mismo dispositivo)', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 1, fecha_evento: '2026-07-27T20:29:56.581Z', ip: '74.125.210.129' }),
    evento({ id_evento: 2, fecha_evento: '2026-07-27T20:29:56.700Z', ip: '74.125.210.129' }),
  ];
  const resultado = agruparDuplicados(eventos);
  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(2)!.grupo_dedup_id, 1);
});

test('ventana justo en el limite (2000ms) agrupa; un milisegundo mas no', () => {
  const base = '2026-07-27T20:29:56.000Z';
  const enElLimite = '2026-07-27T20:29:58.000Z'; // +2000ms exacto
  const pasandoElLimite = '2026-07-27T20:29:58.001Z'; // +2001ms

  const dentro = agruparDuplicados([evento({ id_evento: 1, fecha_evento: base }), evento({ id_evento: 2, fecha_evento: enElLimite })]);
  const porIdDentro = new Map(dentro.map((r) => [r.id_evento, r]));
  assert.strictEqual(porIdDentro.get(2)!.grupo_dedup_id, 1);

  const fuera = agruparDuplicados([evento({ id_evento: 1, fecha_evento: base }), evento({ id_evento: 3, fecha_evento: pasandoElLimite })]);
  const porIdFuera = new Map(fuera.map((r) => [r.id_evento, r]));
  assert.strictEqual(porIdFuera.get(3)!.grupo_dedup_id, 3);
});

test('ventana encadenada: A-B a 1900ms y B-C a 1900ms se funden en un solo grupo aunque A-C sean 3800ms (mas de 2000ms)', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 1, fecha_evento: '2026-07-27T20:00:00.000Z' }), // A
    evento({ id_evento: 2, fecha_evento: '2026-07-27T20:00:01.900Z' }), // B, +1900ms de A
    evento({ id_evento: 3, fecha_evento: '2026-07-27T20:00:03.800Z' }), // C, +1900ms de B, +3800ms de A
  ];
  assert.ok(3800 > VENTANA_DEDUP_MS, 'el test asume que A-C por si solos no entrarian en la ventana');

  const resultado = agruparDuplicados(eventos);
  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(1)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(2)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(3)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(1)!.es_representante_grupo, true);
  assert.strictEqual(porId.get(2)!.es_representante_grupo, false);
  assert.strictEqual(porId.get(3)!.es_representante_grupo, false);
});

test('el resultado respeta el orden de entrada, no el orden interno por fecha', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 9, fecha_evento: '2026-07-27T20:29:56.586Z' }),
    evento({ id_evento: 6, fecha_evento: '2026-07-27T20:27:34.221Z' }),
    evento({ id_evento: 8, fecha_evento: '2026-07-27T20:29:56.581Z' }),
  ];
  const resultado = agruparDuplicados(eventos);
  assert.deepStrictEqual(
    resultado.map((r) => r.id_evento),
    [9, 6, 8],
  );
});

test('desempate por ip no es transitivo: un evento sin ip en el medio no funde dos ips reales y distintas (regresion)', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 1, fecha_evento: '2026-07-27T20:29:56.000Z', ip: '1.1.1.1' }),
    evento({ id_evento: 2, fecha_evento: '2026-07-27T20:29:56.100Z', ip: null }),
    evento({ id_evento: 3, fecha_evento: '2026-07-27T20:29:56.200Z', ip: '2.2.2.2' }),
  ];
  const resultado = agruparDuplicados(eventos);
  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(1)!.grupo_dedup_id, 1, 'evento 1 (ip 1.1.1.1) es su propio grupo');
  assert.strictEqual(porId.get(2)!.grupo_dedup_id, 1, 'evento 2 (sin ip) se funde con el grupo de atras, no rompe la cadena');
  assert.strictEqual(porId.get(3)!.grupo_dedup_id, 3, 'evento 3 (ip 2.2.2.2, distinta a la ip confirmada del grupo) es un dispositivo aparte');
  assert.strictEqual(porId.get(3)!.es_representante_grupo, true);

  const gruposDistintos = new Set(resultado.map((r) => r.grupo_dedup_id));
  assert.strictEqual(gruposDistintos.size, 2, 'dos dispositivos con ip confirmada y distinta no pueden terminar en el mismo grupo');
});

test('la ip del grupo se confirma con la primera no nula, aunque llegue en el segundo evento', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 1, fecha_evento: '2026-07-27T20:29:56.000Z', ip: null }),
    evento({ id_evento: 2, fecha_evento: '2026-07-27T20:29:56.100Z', ip: '1.1.1.1' }),
    evento({ id_evento: 3, fecha_evento: '2026-07-27T20:29:56.200Z', ip: '2.2.2.2' }),
  ];
  const resultado = agruparDuplicados(eventos);
  const porId = new Map(resultado.map((r) => [r.id_evento, r]));
  assert.strictEqual(porId.get(1)!.grupo_dedup_id, 1);
  assert.strictEqual(porId.get(2)!.grupo_dedup_id, 1, 'evento 2 confirma la ip del grupo en 1.1.1.1');
  assert.strictEqual(porId.get(3)!.grupo_dedup_id, 3, 'evento 3 choca contra la ip ya confirmada del grupo (1.1.1.1 != 2.2.2.2)');
});

test('no se borra ni se pierde ninguna fila: la cantidad de resultados siempre iguala la cantidad de eventos de entrada', () => {
  const eventos: EventoParaDedup[] = [
    evento({ id_evento: 6, fecha_evento: '2026-07-27T20:27:34.221Z' }),
    evento({ id_evento: 8, fecha_evento: '2026-07-27T20:29:56.581Z' }),
    evento({ id_evento: 9, fecha_evento: '2026-07-27T20:29:56.586Z' }),
    evento({ id_evento: 13, id_paso_inscripcion: 115, fecha_evento: '2026-07-29T07:16:51.747Z' }),
    evento({ id_evento: 14, id_paso_inscripcion: 115, tipo: 'clic', fecha_evento: '2026-07-29T07:16:56.808Z' }),
    evento({ id_evento: 15, id_paso_inscripcion: 114, tipo: 'clic', fecha_evento: '2026-07-29T07:17:11.372Z' }),
  ];
  const resultado = agruparDuplicados(eventos);
  assert.strictEqual(resultado.length, eventos.length);
});
