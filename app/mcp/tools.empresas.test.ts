// Identidad de cuentas por MCP (2026-07-24): buscar_empresa / crear_empresa /
// actualizar_empresa. Mismo patron de prueba que tools.write.test.ts -- DB de archivo,
// ISPS_DB_PATH antes de importar el modulo, y se verifica leyendo la DB de vuelta con SQL
// crudo, no confiando en lo que la funcion devuelve.
//
// Lo que estas pruebas defienden, en orden de importancia:
//  1. buscar_empresa encuentra por alias, por telefono y por prospeccion, no solo por nombre.
//     Ese es el punto entero de la herramienta: la cuenta que ya existe casi nunca se llama
//     hoy como uno la busca.
//  2. crear_empresa se NIEGA ante un candidato de confianza alta. Es la salvaguarda que
//     faltaba cuando se creo el duplicado de Conexa Tech.
//  3. un notion_page_id ya tomado falla diciendo QUIEN lo tiene, no con un error de SQLite.
//  4. actualizar_empresa no pisa lo que no vino.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { buscarEmpresaTool, crearEmpresaTool, actualizarEmpresaTool } = await import('./tools.ts');
const { idEmpresaSintetico } = await import('../core/empresa-identidad.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(campos: {
  id: string;
  nombre: string;
  normalizado?: string;
  estadoNotion?: string | null;
  categoria?: string | null;
  owner?: string | null;
  pageId?: string | null;
  organizacion?: number;
  proximoPaso?: string | null;
  proximoCanal?: string | null;
  proximaFecha?: string | null;
}) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, categoria, owner, notion_page_id, organizacion_activa_id,
                          proximo_paso, proximo_canal, proximo_follow_up_fecha)
     VALUES (?, 'nit', ?, ?, 'lead', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    campos.id,
    campos.nombre,
    campos.normalizado ?? campos.nombre.toLowerCase(),
    campos.estadoNotion ?? null,
    campos.categoria ?? null,
    campos.owner ?? null,
    campos.pageId ?? null,
    campos.organizacion ?? 1,
    campos.proximoPaso ?? null,
    campos.proximoCanal ?? null,
    campos.proximaFecha ?? null,
  );
  db.close();
}

// --- buscar_empresa: los cuatro frentes -------------------------------------------------

test('buscar_empresa encuentra por ALIAS, no solo por el nombre oficial', () => {
  seedEmpresa({ id: 'b-alias', nombre: 'Redes Andinas del Sur SAS', estadoNotion: 'lead', categoria: 'isp', owner: 'Felipe Castro' });
  const db = raw();
  db.prepare(`INSERT INTO empresa_alias (id_empresa, alias, fuente) VALUES (?, ?, 'master')`).run('b-alias', 'Fibranet Popayan');
  db.close();

  // El nombre buscado no se parece en nada al nombre_oficial: si sale, salio por el alias.
  const r = buscarEmpresaTool({ nombre: 'Fibranet Popayan SAS' });
  const c = r.candidatos.find((x) => x.idEmpresa === 'b-alias');
  assert.ok(c, 'la cuenta tiene que aparecer por su alias');
  assert.equal(c!.confianza, 'alta');
  assert.equal(c!.hits.some((h) => h.frente === 'alias' && h.coincidencia === 'Fibranet Popayan'), true);
  assert.equal(c!.nombreOficial, 'Redes Andinas del Sur SAS');
  assert.equal(c!.owner, 'Felipe Castro');
});

test('buscar_empresa encuentra por TELEFONO de un contacto, aunque el nombre no cruce', () => {
  seedEmpresa({ id: 'b-tel', nombre: 'Cablevision Huila', estadoNotion: 'contacto_iniciado', categoria: 'isp' });
  const db = raw();
  // Guardado con indicativo: la busqueda entra con 10 digitos y tiene que cruzar igual.
  db.prepare(`INSERT INTO contacto (id_empresa, nombre, telefono, fuente) VALUES (?, 'Claudia', '+573184634523', 'notion')`).run('b-tel');
  db.close();

  const r = buscarEmpresaTool({ nombre: 'Una Empresa Que No Existe', telefono: '318 463 4523' });
  const c = r.candidatos.find((x) => x.idEmpresa === 'b-tel');
  assert.ok(c, 'la cuenta tiene que aparecer por el telefono del contacto');
  assert.equal(c!.confianza, 'alta');
  assert.deepEqual(
    c!.hits.map((h) => [h.frente, h.motivo]),
    [['contacto', 'telefono']],
  );
});

test('buscar_empresa encuentra por PROSPECCION: nombre crudo, website y telefonos', () => {
  seedEmpresa({ id: 'b-prosp', nombre: 'Conectando Regiones', estadoNotion: 'lead', categoria: 'isp' });
  const db = raw();
  db.prepare(
    `INSERT INTO prospeccion (id_empresa, empresa_nombre_raw, website, telefonos_raw, fuente)
     VALUES (?, 'CONEXION DIGITAL EXPRESS SAS', 'https://www.conexiondigital.co/', '6017965110 | 3124788888', 'prospeccion_7')`,
  ).run('b-prosp');
  db.close();

  const porNombreRaw = buscarEmpresaTool({ nombre: 'Conexion Digital Express' });
  assert.ok(porNombreRaw.candidatos.some((c) => c.idEmpresa === 'b-prosp'));

  const porDominio = buscarEmpresaTool({ nombre: 'Nada Que Ver', dominio: 'conexiondigital.co' });
  const cd = porDominio.candidatos.find((c) => c.idEmpresa === 'b-prosp');
  assert.ok(cd, 'tiene que cruzar por el website de prospeccion');
  assert.equal(cd!.hits[0].motivo, 'dominio');

  // El segundo numero de la lista, no solo el primero.
  const porTelefono = buscarEmpresaTool({ nombre: 'Nada Que Ver', telefono: '3124788888' });
  const ct = porTelefono.candidatos.find((c) => c.idEmpresa === 'b-prosp');
  assert.ok(ct, 'tiene que cruzar por cualquiera de los telefonos de prospeccion');
  assert.equal(ct!.hits[0].motivo, 'telefono');
});

test('buscar_empresa normaliza la raiz: los sufijos legales no cambian el resultado', () => {
  seedEmpresa({ id: 'b-sufijo', nombre: 'Telecomunicaciones Zafiro S.A.S.', estadoNotion: 'lead', categoria: 'isp' });
  seedEmpresa({ id: 'b-sufijo2', nombre: 'Redes del Cauca ESP', estadoNotion: 'lead', categoria: 'isp' });

  const r = buscarEmpresaTool({ nombre: 'Zafiro Telecomunicaciones LTDA' });
  assert.equal(r.raiz, 'zafiro telecomunicaciones');
  const c = r.candidatos.find((x) => x.idEmpresa === 'b-sufijo');
  assert.ok(c, 'mismos tokens en otro orden y con otro sufijo legal siguen siendo la misma raiz');
  assert.equal(c!.confianza, 'alta');

  // "del" tambien es sufijo legal para el normalizador compartido.
  const r2 = buscarEmpresaTool({ nombre: 'Cauca Redes SAS' });
  assert.equal(r2.candidatos.find((x) => x.idEmpresa === 'b-sufijo2')?.confianza, 'alta');
});

// Limite conocido del normalizador compartido (normalizarRazonSocial), no de esta busqueda:
// "E.S.P." con puntos se parte en tres tokens y la 'p' sobrevive (la lista de sufijos tiene
// 'esp', no 'p'). El candidato NO llega a alta por nombre exacto, se queda en media por la
// señal de typo. Se deja documentado en vez de tocar la lista: esa lista la comparte el
// matcher de gemelos y cambiarla mueve la reconciliacion entera.
//
// Consecuencia practica: crear_empresa no BLOQUEA este caso (solo bloquea en alta), pero
// tampoco lo esconde -- el candidato viaja en candidatosCercanos del resultado.
test('buscar_empresa: "E.S.P." con puntos no llega a alta, se queda en media', () => {
  seedEmpresa({ id: 'b-esp-puntos', nombre: 'Fibra Andina S.A.S. E.S.P.', estadoNotion: 'lead', categoria: 'isp' });

  const r = buscarEmpresaTool({ nombre: 'Fibra Andina SAS' });
  const c = r.candidatos.find((x) => x.idEmpresa === 'b-esp-puntos');
  assert.ok(c, 'el candidato tiene que aparecer igual');
  assert.equal(c!.confianza, 'media');
});

test('crear_empresa deja ver los candidatos que NO alcanzaron a bloquear', () => {
  seedEmpresa({ id: 'b-cercano', nombre: 'Onda Larga Redes S.A.S. E.S.P.', estadoNotion: 'lead', categoria: 'isp' });

  const r = crearEmpresaTool({ nombreOficial: 'Onda Larga Redes SAS', categoria: 'isp', estadoNotion: 'lead', owner: 'Felipe Castro' }, 1);
  assert.equal(r.creada, true);
  if (!r.creada) return;
  assert.equal(r.candidatosCercanos.some((c) => c.idEmpresa === 'b-cercano'), true, 'crea, pero reporta lo que rozo');
});

test('buscar_empresa reporta un solo candidato con TODOS sus frentes cuando cruza por varios', () => {
  seedEmpresa({ id: 'b-multi', nombre: 'Andina Fibra SAS', estadoNotion: 'lead', categoria: 'isp' });
  const db = raw();
  db.prepare(`INSERT INTO empresa_alias (id_empresa, alias, fuente) VALUES (?, 'Andina Fibra', 'master')`).run('b-multi');
  db.prepare(`INSERT INTO contacto (id_empresa, nombre, telefono, fuente) VALUES (?, 'Luis', '3001112233', 'notion')`).run('b-multi');
  db.close();

  const r = buscarEmpresaTool({ nombre: 'Andina Fibra', telefono: '3001112233' });
  const cs = r.candidatos.filter((c) => c.idEmpresa === 'b-multi');
  assert.equal(cs.length, 1, 'una cuenta se reporta una vez, no una por frente');
  const frentes = cs[0].hits.map((h) => h.frente).sort();
  assert.deepEqual(frentes, ['alias', 'contacto', 'empresa']);
});

test('buscar_empresa no inventa candidatos: un nombre sin relacion devuelve vacio', () => {
  const r = buscarEmpresaTool({ nombre: 'Panaderia Los Tres Cerditos' });
  assert.equal(r.total, 0);
  assert.deepEqual(r.candidatos, []);
});

// --- crear_empresa ----------------------------------------------------------------------

test('crear_empresa escribe la cuenta y devuelve lo que quedo, con el id sintetico de la base', () => {
  const r = crearEmpresaTool(
    { nombreOficial: 'Velonet Comunicaciones SAS', categoria: 'isp', estadoNotion: 'contacto_iniciado', owner: 'Sebastian Acosta Molina' },
    1,
  );
  assert.equal(r.creada, true);
  if (!r.creada) return;

  const esperado = idEmpresaSintetico('Velonet Comunicaciones SAS');
  assert.equal(r.empresa.idEmpresa, esperado);
  assert.match(r.empresa.idEmpresa, /^ntn-[0-9a-f]{12}$/);
  assert.equal(r.empresa.tipoId, 'interno');
  // estado_comercial es NOT NULL con CHECK propio y se deriva de la etapa.
  assert.equal(r.empresa.estadoComercial, 'contactado');
  assert.equal(r.empresa.nombreNormalizado, 'velonet comunicaciones');

  const db = raw();
  const fila = db.prepare(`SELECT * FROM empresa WHERE id_empresa = ?`).get(esperado) as any;
  const hist = db.prepare(`SELECT * FROM empresa_estado_historial WHERE id_empresa = ?`).get(esperado) as any;
  db.close();
  assert.equal(fila.categoria, 'isp');
  assert.equal(fila.owner, 'Sebastian Acosta Molina');
  assert.equal(fila.organizacion_activa_id, 1);
  assert.equal(hist.estado_anterior, null);
  assert.equal(hist.estado_nuevo, 'contacto_iniciado');
});

test('crear_empresa con NIT usa el NIT como id_empresa', () => {
  const r = crearEmpresaTool(
    { nombreOficial: 'Nitnet Colombia SAS', categoria: 'utility', estadoNotion: 'lead', owner: 'Thomas Schumacher', nit: '901234567' },
    1,
  );
  assert.equal(r.creada, true);
  if (!r.creada) return;
  assert.equal(r.empresa.idEmpresa, '901234567');
  assert.equal(r.empresa.tipoId, 'nit');
  assert.equal(r.empresa.estadoComercial, 'lead');
});

// La salvaguarda. Es la razon de ser de buscar_empresa dentro de crear_empresa.
test('crear_empresa SE NIEGA cuando ya hay un candidato de confianza alta', () => {
  seedEmpresa({ id: '901400706', nombre: 'CONEXA TELECOMUNICACIONES S.A.S', estadoNotion: null, categoria: 'isp' });

  const r = crearEmpresaTool(
    { nombreOficial: 'Conexa Telecomunicaciones', categoria: 'isp', estadoNotion: 'contacto_iniciado', owner: 'Sebastian Acosta Molina' },
    1,
  );
  assert.equal(r.creada, false);
  if (r.creada) return;
  assert.equal(r.motivo, 'duplicado_probable');
  assert.equal(r.candidatos.some((c) => c.idEmpresa === '901400706'), true);
  assert.match(r.mensaje, /actualizar_empresa/);

  // Y de verdad no escribio nada.
  const db = raw();
  const n = db.prepare(`SELECT count(*) c FROM empresa WHERE id_empresa = ?`).get(idEmpresaSintetico('Conexa Telecomunicaciones')) as any;
  db.close();
  assert.equal(n.c, 0, 'negarse significa no insertar');
});

test('crear_empresa con forzar:true si crea, pese al candidato de confianza alta', () => {
  seedEmpresa({ id: 'dup-base', nombre: 'Gemela Networks', estadoNotion: 'lead', categoria: 'isp' });

  const bloqueada = crearEmpresaTool({ nombreOficial: 'Gemela Networks SAS', categoria: 'isp', estadoNotion: 'lead', owner: 'Camilo fonseca' }, 1);
  assert.equal(bloqueada.creada, false);

  const forzada = crearEmpresaTool(
    { nombreOficial: 'Gemela Networks SAS', categoria: 'isp', estadoNotion: 'lead', owner: 'Camilo fonseca', forzar: true },
    1,
  );
  assert.equal(forzada.creada, true);
});

test('crear_empresa falla claro (no con un error de SQLite) si el notion_page_id ya esta tomado', () => {
  seedEmpresa({ id: 'dueno-page', nombre: 'Dueña Actual De La Pagina', estadoNotion: 'lead', pageId: 'page-tomada-001' });

  assert.throws(
    () =>
      crearEmpresaTool(
        { nombreOficial: 'Cuenta Nueva Sin Relacion Alguna', categoria: 'isp', estadoNotion: 'lead', owner: 'Felipe Castro', notionPageId: 'page-tomada-001' },
        1,
      ),
    (e: Error) => {
      assert.match(e.message, /page-tomada-001/);
      assert.match(e.message, /dueno-page/, 'el mensaje tiene que decir QUIEN la tiene');
      assert.doesNotMatch(e.message, /UNIQUE constraint/i, 'no debe filtrarse el error crudo de SQLite');
      return true;
    },
  );
});

test('crear_empresa rechaza un estado_notion fuera del CHECK y una categoria inventada', () => {
  assert.throws(
    () => crearEmpresaTool({ nombreOficial: 'Estado Malo SAS', categoria: 'isp', estadoNotion: 'reunion_hecha' as never, owner: 'x' }, 1),
    /estadoNotion|invalid/i,
  );
  assert.throws(
    () => crearEmpresaTool({ nombreOficial: 'Categoria Mala SAS', categoria: 'banco' as never, estadoNotion: 'lead', owner: 'x' }, 1),
    /categoria|invalid/i,
  );
});

test('crear_empresa rechaza un NIT que no es un NIT', () => {
  assert.throws(
    () => crearEmpresaTool({ nombreOficial: 'Nit Malo SAS', categoria: 'isp', estadoNotion: 'lead', owner: 'x', nit: '900.123.456-7' }, 1),
    /NIT/,
  );
});

// --- actualizar_empresa -----------------------------------------------------------------

test('actualizar_empresa NO pisa los campos que no vinieron', () => {
  seedEmpresa({
    id: 'act-1',
    nombre: 'Cuenta Con Datos Previos',
    estadoNotion: 'oportunidad',
    categoria: 'isp',
    owner: 'Felipe Castro',
    proximoPaso: 'mandar propuesta',
    proximoCanal: 'llamada',
    proximaFecha: '2026-08-10',
  });

  const devuelto = actualizarEmpresaTool({ idEmpresa: 'act-1', owner: 'Sebastian Acosta Molina' }, 1);

  assert.equal(devuelto.owner, 'Sebastian Acosta Molina');
  assert.equal(devuelto.proximoPaso, 'mandar propuesta', 'proximoPaso no vino: no se toca');
  assert.equal(devuelto.proximoCanal, 'llamada');
  assert.equal(devuelto.proximoFollowUpFecha, '2026-08-10');
  assert.equal(devuelto.categoria, 'isp');
  assert.equal(devuelto.estadoNotion, 'oportunidad', 'la etapa no se mueve desde aca');

  const db = raw();
  const fila = db.prepare(`SELECT * FROM empresa WHERE id_empresa = 'act-1'`).get() as any;
  db.close();
  assert.equal(fila.owner, 'Sebastian Acosta Molina');
  assert.equal(fila.proximo_paso, 'mandar propuesta');
  assert.equal(fila.estado_notion, 'oportunidad');
});

test('actualizar_empresa enlaza una pagina de Notion y devuelve la fila releida', () => {
  seedEmpresa({ id: 'act-2', nombre: 'Cuenta Sin Pagina', estadoNotion: 'lead', categoria: 'isp' });

  const devuelto = actualizarEmpresaTool({ idEmpresa: 'act-2', notionPageId: 'page-nueva-002', categoria: 'utility' }, 1);
  assert.equal(devuelto.notionPageId, 'page-nueva-002');
  assert.equal(devuelto.categoria, 'utility');

  const db = raw();
  const fila = db.prepare(`SELECT notion_page_id, categoria FROM empresa WHERE id_empresa = 'act-2'`).get() as any;
  db.close();
  assert.equal(fila.notion_page_id, 'page-nueva-002');
  assert.equal(fila.categoria, 'utility');
});

test('actualizar_empresa falla claro si la pagina ya es de otra cuenta, y no falla si es la suya', () => {
  seedEmpresa({ id: 'act-3a', nombre: 'Ya Tiene Pagina', estadoNotion: 'lead', pageId: 'page-ocupada-003' });
  seedEmpresa({ id: 'act-3b', nombre: 'Quiere Esa Pagina', estadoNotion: 'lead' });

  assert.throws(
    () => actualizarEmpresaTool({ idEmpresa: 'act-3b', notionPageId: 'page-ocupada-003' }, 1),
    (e: Error) => {
      assert.match(e.message, /act-3a/);
      assert.doesNotMatch(e.message, /UNIQUE constraint/i);
      return true;
    },
  );

  // Reescribir su propia pagina no es un choque.
  const r = actualizarEmpresaTool({ idEmpresa: 'act-3a', notionPageId: 'page-ocupada-003', owner: 'Manuel H.' }, 1);
  assert.equal(r.owner, 'Manuel H.');
});

test('actualizar_empresa exige al menos un campo y respeta el guard de organizacion', () => {
  seedEmpresa({ id: 'act-4', nombre: 'De Otra Organizacion', estadoNotion: 'lead', organizacion: 7 });

  assert.throws(() => actualizarEmpresaTool({ idEmpresa: 'act-4' }, 7), /al menos un campo/);
  assert.throws(() => actualizarEmpresaTool({ idEmpresa: 'act-4', owner: 'x' }, 1), /otra organizacion/);
  assert.throws(() => actualizarEmpresaTool({ idEmpresa: 'no-existe-nunca', owner: 'x' }, 1), /no existe/);
});

test.after(() => borrarDbPrueba(dbPath));
