// Corregir el id provisional de una cuenta por su NIT real. Mueve una PK, asi que lo que estos
// tests protegen es que NO quede a medias: si el padre cambia y una hija no, la fila hija queda
// apuntando a un id que ya no existe y nadie se entera hasta que algo la lea.
//
// El otro riesgo es de negocio: reasignar a un NIT que ya pertenece a otra cuenta seria fusionar
// dos empresas, que es la operacion que metio Fibermax dentro de Fibermat. Por eso falla en vez
// de resolverlo sola.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { reasignarNitTool, moverEstadoTool } = await import('./tools.ts');

const ORG = 8801;

function seed(id: string, nombre: string, opts: { operaBajo?: string } = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id, opera_bajo_id)
       VALUES (?, 'interno', ?, ?, 'lead', 'lead', ?, ?)`,
    )
    .run(id, nombre, nombre.toLowerCase(), ORG, opts.operaBajo ?? null);
  raw.close();
}

function fila(sql: string, ...params: unknown[]): any {
  const raw = new Database(dbPath);
  const r = raw.prepare(sql).get(...(params as any[]));
  raw.close();
  return r;
}

test.after(() => borrarDbPrueba(dbPath));

test('cambia el id provisional por el NIT y marca tipo_id nit', () => {
  seed('ntn-aaaaaaaaaaaa', 'ALFA');
  const r = reasignarNitTool({ idEmpresa: 'ntn-aaaaaaaaaaaa', nit: '901918052' }, ORG);

  assert.equal(r.idAnterior, 'ntn-aaaaaaaaaaaa');
  assert.equal(r.idNuevo, '901918052');
  assert.equal(r.nombreOficial, 'ALFA');

  const e = fila(`SELECT tipo_id, nombre_oficial FROM empresa WHERE id_empresa = '901918052'`);
  assert.equal(e.tipo_id, 'nit');
  assert.equal(e.nombre_oficial, 'ALFA');
  assert.equal(fila(`SELECT 1 AS x FROM empresa WHERE id_empresa = 'ntn-aaaaaaaaaaaa'`), undefined);
});

// El corazon del asunto: las FK de esta base son ON DELETE CASCADE pero NO ON UPDATE CASCADE,
// asi que si esto no arrastra a mano, el historial queda huerfano en silencio.
test('arrastra las filas hijas, no las deja apuntando al id viejo', () => {
  seed('ntn-bbbbbbbbbbbb', 'BETA');
  moverEstadoTool({ idEmpresa: 'ntn-bbbbbbbbbbbb', estado: 'oportunidad', origen: 'notion' }, ORG);

  const antes = fila(`SELECT COUNT(*) c FROM empresa_estado_historial WHERE id_empresa = 'ntn-bbbbbbbbbbbb'`);
  assert.ok(antes.c > 0, 'el seed del historial tiene que existir para que el test pruebe algo');

  const r = reasignarNitTool({ idEmpresa: 'ntn-bbbbbbbbbbbb', nit: '900123456' }, ORG);

  assert.equal(fila(`SELECT COUNT(*) c FROM empresa_estado_historial WHERE id_empresa = 'ntn-bbbbbbbbbbbb'`).c, 0);
  assert.equal(fila(`SELECT COUNT(*) c FROM empresa_estado_historial WHERE id_empresa = '900123456'`).c, antes.c);
  assert.equal(r.filasActualizadas['empresa_estado_historial'], antes.c);
});

test('reapunta a las cuentas que operan bajo la que se reasigna', () => {
  seed('ntn-cccccccccccc', 'GAMMA');
  seed('ntn-dddddddddddd', 'GAMMA FILIAL', { operaBajo: 'ntn-cccccccccccc' });

  reasignarNitTool({ idEmpresa: 'ntn-cccccccccccc', nit: '900222333' }, ORG);

  const filial = fila(`SELECT opera_bajo_id FROM empresa WHERE id_empresa = 'ntn-dddddddddddd'`);
  assert.equal(filial.opera_bajo_id, '900222333', 'la filial no puede quedar colgando de un id que ya no existe');
});

// Los tres rechazos. Cada uno evita un dano distinto.
test('rechaza si el id ya es un NIT: eso no es corregir, es decir que es otra empresa', () => {
  seed('900999888', 'DELTA');
  assert.throws(() => reasignarNitTool({ idEmpresa: '900999888', nit: '900777666' }, ORG), /solo corrige ids provisionales/);
});

test('rechaza si el NIT destino ya es de otra cuenta: eso seria una fusion', () => {
  seed('ntn-eeeeeeeeeeee', 'EPSILON');
  seed('900555444', 'OTRA EMPRESA DISTINTA');
  assert.throws(() => reasignarNitTool({ idEmpresa: 'ntn-eeeeeeeeeeee', nit: '900555444' }, ORG), /fusion/);
  // Y no deja nada a medias
  assert.ok(fila(`SELECT 1 AS x FROM empresa WHERE id_empresa = 'ntn-eeeeeeeeeeee'`));
  assert.equal(fila(`SELECT nombre_oficial FROM empresa WHERE id_empresa = '900555444'`).nombre_oficial, 'OTRA EMPRESA DISTINTA');
});

test('rechaza un NIT que no parece NIT', () => {
  seed('ntn-ffffffffffff', 'ZETA');
  assert.throws(() => reasignarNitTool({ idEmpresa: 'ntn-ffffffffffff', nit: 'no-soy-un-nit' }, ORG), /NIT invalido/);
});

test('rechaza una empresa que no existe en esa organizacion', () => {
  assert.throws(() => reasignarNitTool({ idEmpresa: 'ntn-999999999999', nit: '900111222' }, ORG), /empresa_no_encontrada/);
});

// La otra forma de id provisional que vive en la base (9990000019 Vivercom, 9990000157
// LATITUDE-SH): tambien tiene que poder corregirse.
test('acepta tambien los ids provisionales del rango 999xxxxxxx', () => {
  seed('9990000777', 'ETA');
  const r = reasignarNitTool({ idEmpresa: '9990000777', nit: '900444555' }, ORG);
  assert.equal(r.idNuevo, '900444555');
  assert.equal(fila(`SELECT tipo_id FROM empresa WHERE id_empresa = '900444555'`).tipo_id, 'nit');
});
