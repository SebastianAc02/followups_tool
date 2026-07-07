import assert from 'node:assert/strict';
import test from 'node:test';
import { renderizarCopy } from './render-copy.ts';

test("renderizarCopy sustituye variables y marca faltantes", () => {
  const r = renderizarCopy("Hola [nombre] de [empresa]", { nombre: "Hidaly", empresa: "Giganav" });
  assert.equal(r.texto, "Hola Hidaly de Giganav");
  assert.deepEqual(r.faltantes, []);
});

test("renderizarCopy reporta variable sin dato", () => {
  const r = renderizarCopy("Hola [nombre]", {});
  assert.deepEqual(r.faltantes, ["nombre"]);
  assert.equal(r.texto, "Hola [nombre]");
});

test("renderizarCopy texto sin variables", () => {
  const r = renderizarCopy("Hola mundo", {});
  assert.equal(r.texto, "Hola mundo");
  assert.deepEqual(r.faltantes, []);
});

test("renderizarCopy variable repetida con dato", () => {
  const r = renderizarCopy("Hola [nombre], tu empresa es [empresa] y tu nombre es [nombre]", {
    nombre: "Carlos",
    empresa: "Acme"
  });
  assert.equal(r.texto, "Hola Carlos, tu empresa es Acme y tu nombre es Carlos");
  assert.deepEqual(r.faltantes, []);
});

test("renderizarCopy variable repetida sin dato", () => {
  const r = renderizarCopy("Hola [nombre], tu nombre es [nombre]", {});
  assert.equal(r.texto, "Hola [nombre], tu nombre es [nombre]");
  assert.deepEqual(r.faltantes, ["nombre"]);
});

test("renderizarCopy texto vacío", () => {
  const r = renderizarCopy("", { nombre: "Algo" });
  assert.equal(r.texto, "");
  assert.deepEqual(r.faltantes, []);
});
