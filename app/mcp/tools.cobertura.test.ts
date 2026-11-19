// cobertura_geografica: lo que fijan estos tests es de DONDE sale la zona (los accesos MinTIC por
// municipio, no la sede), que las ciegas no se pierdan, y que un nombre que no resuelve a un solo
// municipio falle explicito en vez de elegir uno.
//
// El harness de pruebas no trae empresa_municipio ni empresa_telefono (en produccion vienen del
// seed, no de una migracion de este repo), ni las columnas de rol del contacto. Se crean aca con la
// misma forma que tienen en produccion (verificada el 2026-11-18).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { coberturaGeograficaTool } = await import('./tools.ts');

const ORG = 8801;

const raw = new Database(dbPath);
raw.exec(`
  CREATE TABLE empresa_municipio (
    id_empresa TEXT NOT NULL, codigo_divipola INTEGER NOT NULL, municipio TEXT NOT NULL,
    codigo_depto INTEGER, departamento TEXT, accesos INTEGER NOT NULL, periodo TEXT NOT NULL,
    PRIMARY KEY (id_empresa, codigo_divipola, periodo)
  );
  CREATE TABLE empresa_telefono (
    id_telefono INTEGER PRIMARY KEY AUTOINCREMENT, id_empresa TEXT NOT NULL, id_contacto INTEGER,
    tipo TEXT NOT NULL, numero TEXT NOT NULL, fuente TEXT NOT NULL, verificado INTEGER NOT NULL DEFAULT 0,
    verificado_at TEXT, es_linea_empresa INTEGER, es_principal INTEGER NOT NULL DEFAULT 0
  );
  ALTER TABLE contacto ADD COLUMN es_rep_legal INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE contacto ADD COLUMN es_gerente INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE contacto ADD COLUMN telefono_fuente TEXT;
`);

function empresa(
  id: string,
  o: { ciudad?: string | null; depto?: string | null; estado?: string; owner?: string; org?: number } = {},
) {
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            organizacion_activa_id, ciudad_principal, departamento, owner)
       VALUES (?, 'nit', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, `EMPRESA ${id}`, id, o.estado ?? 'lead', o.org ?? ORG, o.ciudad ?? null, o.depto ?? null, o.owner ?? null);
}

function accesos(id: string, codigo: number, municipio: string, depto: string, n: number, periodo = '2025-T4') {
  raw
    .prepare(
      `INSERT INTO empresa_municipio (id_empresa, codigo_divipola, municipio, codigo_depto, departamento, accesos, periodo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, codigo, municipio, Math.floor(codigo / 1000), depto, n, periodo);
}

// A: sede en Cartagena, vende en Cartagena y Turbaco.
empresa('A', { ciudad: 'Cartagena', depto: 'Bolívar', owner: 'Sebastian Acosta Molina' });
accesos('A', 13001, 'CARTAGENA', 'Bolívar', 2649);
accesos('A', 13836, 'TURBACO', 'Bolívar', 100);
accesos('A', 13001, 'CARTAGENA', 'Bolívar', 2000, '2025-T3');
// B: sede en Bogota, pero es la que mas accesos tiene en Cartagena. Una lista por sede la esconde.
empresa('B', { ciudad: 'Bogotá', depto: 'Bogotá D.C.' });
accesos('B', 13001, 'CARTAGENA', 'Bolívar', 3125);
// T: telco grande, sale solo si se pide.
empresa('T', { ciudad: 'Bogotá', depto: 'Bogotá D.C.' });
raw.prepare(`INSERT INTO empresa_clasificacion (id_empresa, es_corporativo_grande) VALUES ('T', 1)`).run();
accesos('T', 13001, 'CARTAGENA', 'Bolívar', 70000);
// D: descartada.
empresa('D', { ciudad: 'Cartagena', depto: 'Bolívar', estado: 'descartado' });
accesos('D', 13001, 'CARTAGENA', 'Bolívar', 500);
// C: ciega con accesos en Cartagena.
empresa('C', { ciudad: null, depto: null });
accesos('C', 13001, 'CARTAGENA', 'Bolívar', 96);
// S: ciega con sede en el departamento y sin accesos ahi.
empresa('S', { ciudad: null, depto: 'Bolivar' });
// N: sin ciudad, sin departamento y sin accesos en ningun lado.
empresa('N', { ciudad: null, depto: null });
// X: solo en Medellin.
empresa('X', { ciudad: 'Medellín', depto: 'Antioquia' });
accesos('X', 5001, 'MEDELLÍN', 'Antioquia', 800);
// Municipio con el mismo nombre en dos departamentos.
empresa('AL', { ciudad: 'Albania', depto: 'La Guajira' });
accesos('AL', 44035, 'ALBANIA', 'La Guajira', 10);
accesos('AL', 68020, 'ALBANIA', 'Santander', 10);
// Otra organizacion en Cartagena: no se ve.
empresa('OTRA', { ciudad: 'Cartagena', depto: 'Bolívar', org: 9999 });
accesos('OTRA', 13001, 'CARTAGENA', 'Bolívar', 9000);

raw.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_est_fuente) VALUES ('A', 3000, 'modelo')`).run();
raw.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_reales, usuarios_reales_fuente) VALUES ('B', 1500, 'dictado operador 2026-11-01')`).run();
raw
  .prepare(
    `INSERT INTO contacto (id_empresa, nombre, apellido, cargo, es_rep_legal, es_gerente, telefono, telefono_fuente, fuente)
     VALUES ('A', 'Ana', 'Perez', 'Gerente', 1, 1, '3001112233', 'rues', 'rues')`,
  )
  .run();
raw
  .prepare(`INSERT INTO empresa_telefono (id_empresa, tipo, numero, fuente, verificado, es_principal) VALUES ('A', 'gmaps', '6055551234', 'gmaps', 1, 1)`)
  .run();
raw.close();

test.after(() => borrarDbPrueba(dbPath));

function ok(r: ReturnType<typeof coberturaGeograficaTool>) {
  if ('error' in r) throw new Error(`se esperaba resultado y vino ${JSON.stringify(r)}`);
  return r;
}

test('la zona sale de los accesos, no de la sede: B (sede Bogota) encabeza Cartagena', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: 'cartagena' }));
  assert.equal(r.periodo, '2025-T4');
  assert.deepEqual(r.empresas.map((e) => e.idEmpresa), ['B', 'A', 'C']);
  assert.equal(r.total, 3);
  assert.equal(r.atacables, 3);
  assert.equal(r.truncado, false);
  assert.equal(r.zona.municipio?.codigoDivipola, 13001);
  assert.equal(r.zona.departamento, 'Bolívar');
  const b = r.empresas[0];
  assert.equal(b.ciudadPrincipal, 'Bogotá');
  assert.equal(b.accesosZona, 3125);
});

test('por codigo DIVIPOLA da lo mismo que por nombre', () => {
  const porNombre = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: 'Cartagena' }));
  const porCodigo = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001' }));
  assert.deepEqual(porCodigo.empresas, porNombre.empresas);
});

test('accesos totales y municipios cuentan todo el pais en el periodo', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001' }));
  const a = r.empresas.find((e) => e.idEmpresa === 'A')!;
  assert.equal(a.accesosZona, 2649);
  assert.equal(a.accesosTotales, 2749);
  assert.equal(a.municipiosTotales, 2);
});

test('usuarios: el estimado viaja marcado, el real con su fuente', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001' }));
  const a = r.empresas.find((e) => e.idEmpresa === 'A')!;
  const b = r.empresas.find((e) => e.idEmpresa === 'B')!;
  assert.deepEqual(a.usuariosEstimados, { valor: 3000, fuente: 'modelo', estimado: true });
  assert.equal(a.usuariosReales, null);
  assert.deepEqual(b.usuariosReales, { valor: 1500, fuente: 'dictado operador 2026-11-01' });
});

test('contactos con rol y fuente del telefono, y telefonos de empresa con su tipo', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001' }));
  const a = r.empresas.find((e) => e.idEmpresa === 'A')!;
  assert.equal(a.contactos.length, 1);
  assert.equal(a.contactos[0].nombre, 'Ana Perez');
  assert.equal(a.contactos[0].esRepLegal, true);
  assert.equal(a.contactos[0].esGerente, true);
  assert.equal(a.contactos[0].telefono, '3001112233');
  assert.equal(a.contactos[0].telefonoFuente, 'rues');
  assert.deepEqual(a.telefonos, [{ numero: '6055551234', tipo: 'gmaps', fuente: 'gmaps', verificado: true, esPrincipal: true }]);
  assert.equal(a.owner, 'Sebastian Acosta Molina');
  assert.equal(a.atacable, true);
  assert.equal(a.categoria, 'isp');
});

test('las ciegas del departamento salen aparte, por accesos y por sede', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001' }));
  const c = r.ciegas.find((x) => x.idEmpresa === 'C');
  const s = r.ciegas.find((x) => x.idEmpresa === 'S');
  assert.ok(c && s, 'C y S tienen que salir como ciegas de Bolivar');
  assert.equal(c!.porQue, 'accesos_en_departamento');
  assert.equal(c!.enLista, true);
  assert.equal(s!.porQue, 'sede_en_departamento');
  assert.equal(s!.enLista, false);
  assert.equal(s!.accesosEnDepartamento, 0);
  assert.ok(!r.ciegas.some((x) => x.idEmpresa === 'N'));
  assert.equal(r.sinUbicacionEnNingunaZona, 1);
});

test('descartadas y categorias excluidas no salen por default y salen si se piden', () => {
  const def = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001' }));
  assert.ok(!def.empresas.some((e) => e.idEmpresa === 'T' || e.idEmpresa === 'D'));
  const todo = ok(
    coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001', incluirDescartadas: true, excluirCategorias: [] }),
  );
  assert.deepEqual(todo.empresas.map((e) => e.idEmpresa), ['T', 'B', 'A', 'D', 'C']);
  const t = todo.empresas[0];
  assert.equal(t.categoria, 'telco_grande');
  assert.equal(t.atacable, false);
  assert.equal(todo.atacables, 4);
});

test('otra organizacion no se ve', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001' }));
  assert.ok(!r.empresas.some((e) => e.idEmpresa === 'OTRA'));
});

test('accesosMin corta por accesos en la zona', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001', accesosMin: 1000 }));
  assert.deepEqual(r.empresas.map((e) => e.idEmpresa), ['B', 'A']);
});

test('limite trunca y lo dice', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001', limite: 1 }));
  assert.equal(r.devueltas, 1);
  assert.equal(r.total, 3);
  assert.equal(r.truncado, true);
});

test('solo departamento suma todos sus municipios', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, departamento: 'bolivar' }));
  assert.equal(r.zona.tipo, 'departamento');
  assert.equal(r.zona.municipiosEnDepartamento, 2);
  const a = r.empresas.find((e) => e.idEmpresa === 'A')!;
  assert.equal(a.accesosZona, 2749);
  assert.equal(a.municipiosEnZona, 2);
  const porCodigo = ok(coberturaGeograficaTool({ idOrganizacion: ORG, departamento: '13' }));
  assert.deepEqual(porCodigo.empresas, r.empresas);
});

test('un periodo anterior devuelve sus propios accesos', () => {
  const r = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001', periodo: '2025-T3' }));
  assert.deepEqual(r.empresas.map((e) => [e.idEmpresa, e.accesosZona]), [['A', 2000]]);
  assert.equal(r.filtros.periodo, '2025-T3');
});

// --- caminos de error -------------------------------------------------------------------

test('error: sin municipio ni departamento', () => {
  const r = coberturaGeograficaTool({ idOrganizacion: ORG });
  assert.equal('error' in r && r.error, 'falta_zona');
});

test('error: periodo sin datos, con los disponibles', () => {
  const r = coberturaGeograficaTool({ idOrganizacion: ORG, municipio: '13001', periodo: '2024-T1' });
  assert.ok('error' in r && r.error === 'periodo_sin_datos');
  assert.deepEqual((r as { periodosDisponibles: string[] }).periodosDisponibles, ['2025-T4', '2025-T3']);
});

test('error: municipio no encontrado, con sugerencias', () => {
  const r = coberturaGeograficaTool({ idOrganizacion: ORG, municipio: 'Cartagen' });
  assert.ok('error' in r && r.error === 'municipio_no_encontrado');
  assert.deepEqual(
    (r as { sugerencias: { codigoDivipola: number }[] }).sugerencias.map((s) => s.codigoDivipola),
    [13001],
  );
});

test('error: nombre repetido en dos departamentos no elige uno', () => {
  const r = coberturaGeograficaTool({ idOrganizacion: ORG, municipio: 'Albania' });
  assert.ok('error' in r && r.error === 'municipio_ambiguo');
  assert.equal((r as { candidatos: unknown[] }).candidatos.length, 2);
  const conDepto = ok(coberturaGeograficaTool({ idOrganizacion: ORG, municipio: 'Albania', departamento: 'Santander' }));
  assert.equal(conDepto.zona.municipio?.codigoDivipola, 68020);
});

test('error: municipio fuera del departamento pedido', () => {
  const r = coberturaGeograficaTool({ idOrganizacion: ORG, municipio: 'Cartagena', departamento: 'Antioquia' });
  assert.ok('error' in r && r.error === 'municipio_fuera_del_departamento');
});

test('error: departamento no encontrado', () => {
  const r = coberturaGeograficaTool({ idOrganizacion: ORG, departamento: 'Atlantida' });
  assert.ok('error' in r && r.error === 'departamento_no_encontrado');
});
