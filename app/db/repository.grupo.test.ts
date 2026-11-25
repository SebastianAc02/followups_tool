// Grupo empresarial (id_empresa_matriz) y la coherencia de aliado con la vista empresa_categoria.
//
// Lo que fija este archivo:
//   - marcarGrupo escribe en transaccion, deja rastro y devuelve el grupo releido.
//   - un grupo tiene UN nivel: ni cadenas, ni ciclos, ni cuentas fusionadas.
//   - colapsarPorMatriz deja una fila por COALESCE(id_empresa_matriz, id_empresa).
//   - marcarAliado lleva alianza_sae_plus al mismo lado que empresa.aliado, para que la vista no
//     siga diciendo sae_plus de una cuenta que alguien verifico como propia.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { marcarGrupo, gruposPorMatriz, colapsarPorMatriz, marcarAliado, cuentasParaReconciliar } = await import('./repository.ts');
const { db } = await import('./index.ts');

test.after(() => borrarDbPrueba(dbPath));

const ORG = 1;
const QUIEN = 'Sebastian Acosta Molina';

function seed(id: string, o: { matriz?: string; opera?: string; org?: number; usuarios?: number } = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id, id_empresa_matriz, opera_bajo_id, notion_page_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', ?, ?, ?, ?)`,
    )
    .run(id, `NOMBRE ${id}`, id, o.org ?? ORG, o.matriz ?? null, o.opera ?? null, `ntn-${id}`);
  if (o.usuarios != null) {
    raw.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_efectivos) VALUES (?, ?, ?)`).run(id, o.usuarios, o.usuarios);
  }
  raw.close();
}

function crudo<T>(q: string, ...p: unknown[]): T {
  const raw = new Database(dbPath);
  const r = raw.prepare(q).get(...p) as T;
  raw.close();
  return r;
}

const base = { fuente: 'RUES', quien: QUIEN };

// --- marcarGrupo ----------------------------------------------------------------------

test('marcarGrupo deja la cuenta como satelite y devuelve el grupo releido con id y nombre', () => {
  seed('g-mat', { usuarios: 5000 });
  seed('g-sat', { usuarios: 1200 });

  const r = marcarGrupo({ ...base, idEmpresa: 'g-sat', idMatriz: 'g-mat', nota: 'mismo dueno en RUES' }, ORG);

  assert.equal(r.cambio, true);
  assert.equal(r.matrizAntes, null);
  assert.equal(r.matrizDespues, 'g-mat');
  assert.equal(r.grupoAnterior, null);
  assert.ok(r.grupo);
  assert.equal(r.grupo.idGrupo, 'g-mat');
  assert.deepEqual(r.grupo.matriz, { idEmpresa: 'g-mat', nombre: 'NOMBRE g-mat' });
  assert.deepEqual(
    r.grupo.integrantes.map((i) => [i.idEmpresa, i.nombre, i.esMatriz]),
    [
      ['g-mat', 'NOMBRE g-mat', true],
      ['g-sat', 'NOMBRE g-sat', false],
    ],
  );
  assert.equal(r.grupo.usuariosEfectivosGrupo, 6200);

  // Lo escrito esta en la base, no solo en la respuesta.
  assert.equal(crudo<{ m: string }>(`SELECT id_empresa_matriz AS m FROM empresa WHERE id_empresa = 'g-sat'`).m, 'g-mat');
  const rastro = crudo<{ detalle: string }>(
    `SELECT detalle FROM sync_cambios WHERE id_registro = 'g-sat' AND detalle LIKE 'id_empresa_matriz%' ORDER BY id DESC`,
  );
  assert.match(rastro.detalle, /ninguna -> g-mat/);
  assert.match(rastro.detalle, /RUES/);
  assert.match(rastro.detalle, new RegExp(QUIEN));
});

test('marcarGrupo con idMatriz null suelta la cuenta y devuelve el grupo del que salio', () => {
  seed('d-mat');
  seed('d-sat', { matriz: 'd-mat' });

  const r = marcarGrupo({ ...base, idEmpresa: 'd-sat', idMatriz: null }, ORG);

  assert.equal(r.cambio, true);
  assert.equal(r.matrizAntes, 'd-mat');
  assert.equal(r.matrizDespues, null);
  assert.equal(r.grupo, null);
  assert.ok(r.grupoAnterior);
  assert.deepEqual(
    r.grupoAnterior.integrantes.map((i) => i.idEmpresa),
    ['d-mat'],
    'la cuenta ya no aparece en el grupo del que salio',
  );
});

test('marcarGrupo al mismo valor no escribe ni deja rastro', () => {
  seed('i-mat');
  seed('i-sat', { matriz: 'i-mat' });
  const antes = crudo<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_cambios WHERE id_registro = 'i-sat'`).n;

  const r = marcarGrupo({ ...base, idEmpresa: 'i-sat', idMatriz: 'i-mat' }, ORG);

  assert.equal(r.cambio, false);
  assert.equal(r.grupo?.idGrupo, 'i-mat');
  assert.equal(crudo<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_cambios WHERE id_registro = 'i-sat'`).n, antes);
});

test('marcarGrupo falla si la cuenta o la matriz no existen', () => {
  seed('e-real');
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'e-no-existe', idMatriz: 'e-real' }, ORG), /no existe/);
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'e-real', idMatriz: 'e-no-existe' }, ORG), /matriz e-no-existe no existe/);
});

test('marcarGrupo no cruza organizaciones', () => {
  seed('o-mia');
  seed('o-ajena', { org: 77 });
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'o-mia', idMatriz: 'o-ajena' }, ORG), /no existe/);
});

test('marcarGrupo rechaza a la cuenta como su propia matriz', () => {
  seed('c-sola');
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'c-sola', idMatriz: 'c-sola' }, ORG), /propia matriz/);
});

test('marcarGrupo rechaza cadenas: la matriz no puede tener matriz', () => {
  seed('k-raiz');
  seed('k-medio', { matriz: 'k-raiz' });
  seed('k-hoja');
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'k-hoja', idMatriz: 'k-medio' }, ORG), /una matriz no puede tener matriz/);
  assert.equal(crudo<{ m: string | null }>(`SELECT id_empresa_matriz AS m FROM empresa WHERE id_empresa = 'k-hoja'`).m, null);
});

test('marcarGrupo rechaza ciclos: una matriz con satelites no puede volverse satelite', () => {
  seed('y-a');
  seed('y-b', { matriz: 'y-a' });
  // y-a ya es matriz de y-b; meterla bajo y-b cerraria un ciclo de dos.
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'y-a', idMatriz: 'y-b' }, ORG), /satelite de y-a|es matriz de y-b/);
  seed('y-c');
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'y-a', idMatriz: 'y-c' }, ORG), /es matriz de y-b/);
});

test('marcarGrupo no aplica a cuentas fusionadas (opera_bajo_id), ni como cuenta ni como matriz', () => {
  seed('f-viva');
  seed('f-muerta', { opera: 'f-viva' });
  seed('f-otra');
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'f-muerta', idMatriz: 'f-otra' }, ORG), /fusionada en f-viva/);
  assert.throws(() => marcarGrupo({ ...base, idEmpresa: 'f-otra', idMatriz: 'f-muerta' }, ORG), /Usa f-viva como matriz/);
});

test('marcarGrupo exige fuente y quien', () => {
  seed('p-a');
  seed('p-b');
  assert.throws(() => marcarGrupo({ idEmpresa: 'p-a', idMatriz: 'p-b', fuente: '', quien: QUIEN }, ORG));
  assert.throws(() => marcarGrupo({ idEmpresa: 'p-a', idMatriz: 'p-b', fuente: 'RUES', quien: '' }, ORG));
});

// --- gruposPorMatriz y colapsarPorMatriz -----------------------------------------------

test('gruposPorMatriz: sin tamano en ningun integrante el grupo no suma cero, suma null', () => {
  seed('s-mat');
  seed('s-sat', { matriz: 's-mat' });
  const g = gruposPorMatriz(db, ORG, ['s-mat']).get('s-mat')!;
  assert.equal(g.usuariosEfectivosGrupo, null);
  assert.equal(g.integrantesSinTamano, 2);
});

test('gruposPorMatriz deja fuera a los satelites fusionados', () => {
  seed('v-mat');
  seed('v-sat', { matriz: 'v-mat' });
  seed('v-absorbida', { matriz: 'v-mat', opera: 'v-sat' });
  const g = gruposPorMatriz(db, ORG, ['v-mat']).get('v-mat')!;
  assert.deepEqual(g.integrantes.map((i) => i.idEmpresa), ['v-mat', 'v-sat']);
});

test('colapsarPorMatriz deja una fila por grupo, ordenada por el peso del grupo, con la matriz de representante', () => {
  const filas = [
    { idEmpresa: 'suelta', idEmpresaMatriz: null, n: 900 },
    { idEmpresa: 'sat1', idEmpresaMatriz: 'mat', n: 600 },
    { idEmpresa: 'mat', idEmpresaMatriz: null, n: 100 },
    { idEmpresa: 'sat2', idEmpresaMatriz: 'mat', n: 400 },
    { idEmpresa: 'solo-sat', idEmpresaMatriz: 'mat-ausente', n: 50 },
  ];
  const r = colapsarPorMatriz(filas, (f) => f.n);
  assert.deepEqual(
    r.map((g) => [g.idGrupo, g.representante.idEmpresa, g.peso, g.miembros.length]),
    [
      ['mat', 'mat', 1100, 3],
      ['suelta', 'suelta', 900, 1],
      ['mat-ausente', 'solo-sat', 50, 1],
    ],
  );
});

test('colapsarPorMatriz sin la matriz en la lista toma de representante al integrante mas pesado', () => {
  const r = colapsarPorMatriz(
    [
      { idEmpresa: 'a', idEmpresaMatriz: 'm', n: 10 },
      { idEmpresa: 'b', idEmpresaMatriz: 'm', n: 30 },
    ],
    (f) => f.n,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].representante.idEmpresa, 'b');
});

// --- cuentas: idEmpresaMatriz en cada fila, sin colapsar ---------------------------------

test('cuentasParaReconciliar trae idEmpresaMatriz en cada fila y no colapsa el grupo', () => {
  seed('r-mat');
  seed('r-sat', { matriz: 'r-mat' });
  const filas = cuentasParaReconciliar(ORG);
  const mat = filas.find((f) => f.idEmpresa === 'r-mat');
  const sat = filas.find((f) => f.idEmpresa === 'r-sat');
  assert.ok(mat && sat, 'las dos filas siguen en la lista');
  assert.equal(mat.idEmpresaMatriz, null);
  assert.equal(sat.idEmpresaMatriz, 'r-mat');
});

// --- coherencia de aliado con la vista --------------------------------------------------

function categoria(id: string) {
  return crudo<{ categoria: string }>(`SELECT categoria FROM empresa_categoria WHERE id_empresa = ?`, id).categoria;
}

test('marcar ninguno_verificado apaga alianza_sae_plus y la vista deja de decir sae_plus', () => {
  seed('a-sae');
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO empresa_clasificacion (id_empresa, alianza_sae_plus, motivo, fuente) VALUES ('a-sae', 1, 'crm SAE Plus', 'seed')`).run();
  raw.close();
  assert.equal(categoria('a-sae'), 'sae_plus');

  const r = marcarAliado({ idEmpresa: 'a-sae', aliado: 'ninguno_verificado', fuente: 'llamada', quien: QUIEN, fecha: '2026-11-25' }, ORG);

  assert.equal(r.categoria, 'isp');
  assert.equal(categoria('a-sae'), 'isp');
  assert.equal(r.clasificacionInterna.alianzaSaePlus, false);
  assert.equal(r.clasificacionInterna.tocada, true);
  assert.equal(r.clasificacionInterna.fuente, 'llamada');
  assert.equal(r.clasificacionInterna.actualizadoPor, QUIEN);
  assert.match(r.clasificacionInterna.motivo ?? '', /ninguno_verificado/);
  assert.match(r.clasificacionInterna.motivo ?? '', /2026-11-25/);
  const rastro = crudo<{ detalle: string }>(
    `SELECT detalle FROM sync_cambios WHERE id_registro = 'a-sae' AND entidad = 'empresa_clasificacion' ORDER BY id DESC`,
  );
  assert.match(rastro.detalle, /alianza_sae_plus: 1 -> 0/);
  assert.match(rastro.detalle, /motivo anterior: crm SAE Plus/);
});

test('marcar sin_verificar tambien apaga alianza_sae_plus', () => {
  seed('a-sinv');
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO empresa_clasificacion (id_empresa, alianza_sae_plus) VALUES ('a-sinv', 1)`).run();
  raw.close();

  const r = marcarAliado({ idEmpresa: 'a-sinv', aliado: 'sin_verificar', fuente: 'operador', quien: QUIEN }, ORG);

  assert.equal(r.clasificacionInterna.alianzaSaePlus, false);
  assert.equal(categoria('a-sinv'), 'isp');
});

test('marcar sae_plus enciende alianza_sae_plus aunque la cuenta no tuviera fila de clasificacion', () => {
  seed('a-nueva');
  assert.equal(crudo<unknown>(`SELECT 1 FROM empresa_clasificacion WHERE id_empresa = 'a-nueva'`), undefined);

  const r = marcarAliado({ idEmpresa: 'a-nueva', aliado: 'sae_plus', fuente: 'notion', quien: QUIEN }, ORG);

  assert.equal(r.categoria, 'sae_plus');
  assert.equal(r.clasificacionInterna.alianzaSaePlus, true);
  assert.equal(r.clasificacionInterna.tocada, true);
  assert.equal(categoria('a-nueva'), 'sae_plus');
});

test('apagar no pisa el motivo de otro flag prendido: lo conserva y agrega el nuevo', () => {
  seed('a-carrier');
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO empresa_clasificacion (id_empresa, alianza_sae_plus, es_carrier, motivo) VALUES ('a-carrier', 1, 1, 'carrier mayorista')`)
    .run();
  raw.close();

  const r = marcarAliado({ idEmpresa: 'a-carrier', aliado: 'ninguno_verificado', fuente: 'operador', quien: QUIEN }, ORG);

  assert.equal(r.categoria, 'carrier', 'el otro flag sigue mandando');
  assert.match(r.clasificacionInterna.motivo ?? '', /^carrier mayorista \| aliado=ninguno_verificado/);
});

test('apagar sin fila de clasificacion no crea una fila ni deja rastro', () => {
  seed('a-limpia');
  const r = marcarAliado({ idEmpresa: 'a-limpia', aliado: 'ninguno_verificado', fuente: 'operador', quien: QUIEN }, ORG);
  assert.equal(r.clasificacionInterna.alianzaSaePlus, null);
  assert.equal(r.clasificacionInterna.tocada, false);
  assert.equal(r.categoria, 'isp');
  assert.equal(crudo<unknown>(`SELECT 1 FROM empresa_clasificacion WHERE id_empresa = 'a-limpia'`), undefined);
  assert.equal(
    crudo<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_cambios WHERE id_registro = 'a-limpia' AND entidad = 'empresa_clasificacion'`).n,
    0,
  );
});

test('ultimo_kilometro e integrapay no tocan alianza_sae_plus', () => {
  seed('a-uk');
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO empresa_clasificacion (id_empresa, alianza_sae_plus) VALUES ('a-uk', 1)`).run();
  raw.close();

  const r = marcarAliado({ idEmpresa: 'a-uk', aliado: 'ultimo_kilometro', fuente: 'operador', quien: QUIEN }, ORG);

  assert.equal(r.clasificacionInterna.tocada, false);
  assert.equal(r.clasificacionInterna.alianzaSaePlus, true, 'con el flag en 1 la cuenta sigue fuera de las listas, que es lo correcto para un aliado');
});

test('marcarAliado sobre una cuenta que no existe falla y no escribe clasificacion', () => {
  assert.throws(() => marcarAliado({ idEmpresa: 'a-fantasma', aliado: 'sae_plus', fuente: 'operador', quien: QUIEN }, ORG), /no existe/);
  assert.equal(crudo<unknown>(`SELECT 1 FROM empresa_clasificacion WHERE id_empresa = 'a-fantasma'`), undefined);
});
