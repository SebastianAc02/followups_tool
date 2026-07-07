import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarPorCanal, conteosPorCanal, type FilaAgenda } from './agenda.ts';

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
