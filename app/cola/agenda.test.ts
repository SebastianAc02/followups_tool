import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarPorCanal, conteosPorCanal, filaSinVencimiento, type FilaAgenda, type FilaCola } from './agenda.ts';

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
  return { id, empresa: `Empresa ${id}`, ciudad: null, contacto: null, cargo: null, canal: null, estado: 'on_hold', fecha };
}

test('filaSinVencimiento: con fecha la muestra tal cual, sin fecha dice "sin fecha"', () => {
  const conFecha = filaSinVencimiento(filaColaBase('c1', '2026-07-20'));
  assert.equal(conFecha.sev, 'today');
  assert.equal(conFecha.severidadTexto, '2026-07-20');

  const sinFecha = filaSinVencimiento(filaColaBase('c2', null));
  assert.equal(sinFecha.severidadTexto, 'sin fecha');
});
