import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarPorCanal,
  conteosPorCanal,
  filaSinVencimiento,
  diasVencido,
  filaConVencimiento,
  frescuraDe,
  bucketDeEtapa,
  unificarCola,
  aplicarFiltrosUnificados,
  type FilaAgenda,
  type FilaCola,
  type Bucket,
  type FilaColaConBucket,
  type FiltrosUnificados,
} from './agenda.ts';

function fila(canal: FilaAgenda['canal'], id: string = canal): FilaAgenda {
  return {
    id,
    empresa: `Empresa ${id}`,
    ciudad: null,
    contacto: null,
    cargo: null,
    canal,
    estado: null,
    sev: 'today',
    severidadTexto: 'hoy',
    actual: false,
  };
}

const COLA: FilaAgenda[] = [fila('llamada', 'a'), fila('correo', 'b'), fila('whatsapp', 'c'), fila('llamada', 'd')];

test('filtrarPorCanal: todos devuelve la cola completa', () => {
  assert.equal(filtrarPorCanal(COLA, 'todos').length, 4);
});

test('filtrarPorCanal: un canal especifico solo trae ese canal', () => {
  const filtradas = filtrarPorCanal(COLA, 'llamada');
  assert.equal(filtradas.length, 2);
  assert.ok(filtradas.every((f) => f.canal === 'llamada'));
});

test('filtrarPorCanal: cola vacia da lista vacia sin importar el filtro', () => {
  assert.deepEqual(filtrarPorCanal([], 'correo'), []);
});

test('conteosPorCanal: cuenta cada canal y el total en "todos"', () => {
  assert.deepEqual(conteosPorCanal(COLA), { todos: 4, llamada: 2, correo: 1, whatsapp: 1 });
});

test('conteosPorCanal: cola vacia da todo en cero', () => {
  assert.deepEqual(conteosPorCanal([]), { todos: 0, llamada: 0, correo: 0, whatsapp: 0 });
});

function filaColaBase(id: string, fecha: string | null): FilaCola {
  return { id, empresa: `Empresa ${id}`, ciudad: null, contacto: null, cargo: null, canal: null, estado: 'on_hold', fecha, campana: null };
}

function filaConBucket(id: string, fecha: string | null, bucket: Bucket, campana: string | null = null): FilaColaConBucket {
  return { ...filaColaBase(id, fecha), campana, bucket };
}

test('filaSinVencimiento: con fecha la muestra tal cual, sin fecha dice "sin fecha"', () => {
  const conFecha = filaSinVencimiento(filaColaBase('c1', '2026-07-20'));
  assert.equal(conFecha.sev, 'today');
  assert.equal(conFecha.severidadTexto, '2026-07-20');

  const sinFecha = filaSinVencimiento(filaColaBase('c2', null));
  assert.equal(sinFecha.severidadTexto, 'sin fecha');
});

test('diasVencido: dias de diferencia entre dos fechas ISO', () => {
  assert.equal(diasVencido('2026-07-10', '2026-07-14'), 4);
  assert.equal(diasVencido('2026-07-14', '2026-07-14'), 0);
});

test('filaConVencimiento: vencida dice "vencido Nd", de hoy dice "hoy"', () => {
  const vencida = filaConVencimiento(filaColaBase('v1', '2026-07-10'), '2026-07-14', false);
  assert.equal(vencida.sev, 'overdue');
  assert.equal(vencida.severidadTexto, 'vencido 4d');

  const deHoy = filaConVencimiento(filaColaBase('v2', '2026-07-14'), '2026-07-14', true);
  assert.equal(deHoy.sev, 'today');
  assert.equal(deHoy.severidadTexto, 'hoy');
  assert.equal(deHoy.actual, true);
});

test('frescuraDe: sin fecha, vigente (0-6 dias), desactualizado (7+ dias)', () => {
  assert.equal(frescuraDe(null, '2026-07-14'), 'sin_fecha');
  assert.equal(frescuraDe('2026-07-14', '2026-07-14'), 'vigente'); // hoy: 0 dias
  assert.equal(frescuraDe('2026-07-08', '2026-07-14'), 'vigente'); // 6 dias
  assert.equal(frescuraDe('2026-07-07', '2026-07-14'), 'desactualizado'); // 7 dias
  assert.equal(frescuraDe('2026-06-01', '2026-07-14'), 'desactualizado');
});

test('bucketDeEtapa: estados calientes son cierre, el resto es lead', () => {
  assert.equal(bucketDeEtapa('oportunidad'), 'cierre');
  assert.equal(bucketDeEtapa('reunion_agendada'), 'cierre');
  assert.equal(bucketDeEtapa('lead'), 'lead');
  assert.equal(bucketDeEtapa('contacto_iniciado'), 'lead');
  assert.equal(bucketDeEtapa('on_hold'), 'lead');
  assert.equal(bucketDeEtapa(null), 'lead');
});

test('unificarCola: ordena vigente < sin_fecha < desactualizado, y dentro de cada grupo por fecha ascendente', () => {
  const filas: FilaColaConBucket[] = [
    filaConBucket('viejo', '2026-06-01', 'lead'), // desactualizado (43 dias)
    filaConBucket('hoy', '2026-07-14', 'lead'), // vigente
    filaConBucket('sinfecha', null, 'cierre'),
    filaConBucket('vencido3d', '2026-07-11', 'reagendar'), // vigente
  ];

  const r = unificarCola(filas, '2026-07-14');
  assert.deepEqual(r.map((f) => f.id), ['vencido3d', 'hoy', 'sinfecha', 'viejo']);
  assert.equal(r[0].actual, true); // el primero de la lista ordenada es "AHORA"
  assert.equal(r[1].actual, false);
  assert.equal(r.find((f) => f.id === 'viejo')?.frescura, 'desactualizado');
});

test('unificarCola: cierre usa filaSinVencimiento (sin severidad de vencido), lead/reagendar usan vencido', () => {
  const filas: FilaColaConBucket[] = [
    filaConBucket('c1', '2026-06-01', 'cierre'), // muy vencido, pero es cierre: no dice "vencido"
    filaConBucket('l1', '2026-06-01', 'lead'), // muy vencido y es lead: si dice "vencido"
  ];
  const r = unificarCola(filas, '2026-07-14');
  const c1 = r.find((f) => f.id === 'c1')!;
  const l1 = r.find((f) => f.id === 'l1')!;
  assert.equal(c1.severidadTexto, '2026-06-01'); // filaSinVencimiento: la fecha tal cual
  assert.equal(l1.severidadTexto.startsWith('vencido'), true);
});

test('aplicarFiltrosUnificados: sin filtros trae todo; cada filtro corta por su campo', () => {
  const filas: FilaColaConBucket[] = [
    filaConBucket('a', '2026-07-14', 'lead', 'Campana A'),
    filaConBucket('b', '2026-07-14', 'cierre', 'Campana B'),
  ];
  const unificadas = unificarCola(filas, '2026-07-14').map((f, i) => ({ ...f, canal: i === 0 ? 'llamada' : 'correo' }) as const);

  const sinFiltro: FiltrosUnificados = { bucket: 'todos', campana: 'todas', canal: 'todos', frescura: 'todas' };
  assert.equal(aplicarFiltrosUnificados(unificadas, sinFiltro).length, 2);

  const soloLead = aplicarFiltrosUnificados(unificadas, { ...sinFiltro, bucket: 'lead' });
  assert.deepEqual(soloLead.map((f) => f.id), ['a']);

  const soloCampanaB = aplicarFiltrosUnificados(unificadas, { ...sinFiltro, campana: 'Campana B' });
  assert.deepEqual(soloCampanaB.map((f) => f.id), ['b']);
});
