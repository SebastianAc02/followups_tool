// editar_toque (write nueva, 2026-07-26) y el idContacto que registrar_toque no aceptaba.
// Mismo patron que tools.write.test.ts: DB de archivo, ISPS_DB_PATH fijado ANTES del import
// dinamico de tools.ts, siembra y relectura con better-sqlite3 crudo.
//
// El caso que origino la tool: tres reuniones con duracion conocida (55, 71 y 50 minutos,
// sacadas de tl;dv) que no se podian guardar porque registrar_toque solo crea. Se prueba con
// esos mismos numeros a proposito.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { editarToqueTool, registrarToqueTool } = await import('./tools.ts');

function seedEmpresa(id: string, idOrganizacion = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', ?)`,
    )
    .run(id, id, id, idOrganizacion);
  raw.close();
}

function seedContacto(idEmpresa: string, nombre: string): number {
  const raw = new Database(dbPath);
  const r = raw
    .prepare(`INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, fuente) VALUES (?, ?, 0, 0, 'test')`)
    .run(idEmpresa, nombre);
  raw.close();
  return Number(r.lastInsertRowid);
}

function leerToque(idToque: number): any {
  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT * FROM toque WHERE id_toque = ?`).get(idToque);
  raw.close();
  return fila;
}

test('editarToqueTool escribe la duracion que faltaba y devuelve el toque releido', () => {
  seedEmpresa('e1');
  const { toque } = registrarToqueTool(
    { idEmpresa: 'e1', canal: 'reunion', resultado: 'reunion_buena', fecha: '2026-07-20' } as never,
    1,
  );
  assert.equal(toque.duracionSegundos, null);

  const r = editarToqueTool(
    { idToque: toque.idToque, motivo: 'llego la duracion de tl;dv', duracionSegundos: 55 * 60 },
    1,
  );

  // Contra la DB cruda: la garantia es el UPDATE, no el objeto que devolvio la funcion.
  assert.equal(leerToque(toque.idToque).duracion_segundos, 3300);
  // Y la tool devuelve lo que quedo escrito, releido, no un { ok: true }.
  assert.equal(r.toque.duracionSegundos, 3300);
  assert.equal(r.sinCambios, false);
  assert.deepEqual(r.cambios, [{ campo: 'duracionSegundos', antes: null, despues: 3300 }]);
});

test('editarToqueTool deja rastro en sync_cambios con el motivo y el antes -> despues', () => {
  seedEmpresa('e2');
  const { toque } = registrarToqueTool(
    { idEmpresa: 'e2', canal: 'reunion', resultado: 'reunion_buena', fecha: '2026-07-21' } as never,
    1,
  );
  editarToqueTool({ idToque: toque.idToque, motivo: 'llego la duracion de tl;dv', duracionSegundos: 71 * 60 }, 1);

  const raw = new Database(dbPath);
  const fila = raw
    .prepare(`SELECT * FROM sync_cambios WHERE entidad = 'toque' AND accion = 'update' AND id_registro = ?`)
    .get(String(toque.idToque)) as any;
  raw.close();
  assert.ok(fila, 'la edicion tiene que dejar fila en sync_cambios');
  assert.match(fila.detalle, /llego la duracion de tl;dv/);
  assert.match(fila.detalle, /duracionSegundos: - -> 4260/);
  // La empresa va en el detalle: id_registro es el id DEL TOQUE, para poder buscar por la fila
  // que se edito.
  assert.match(fila.detalle, /^e2 \|/);
});

test('editarToqueTool solo escribe los campos que de verdad cambian', () => {
  seedEmpresa('e3');
  const { toque } = registrarToqueTool(
    { idEmpresa: 'e3', canal: 'reunion', resultado: 'reunion_buena', fecha: '2026-07-22', duracionSegundos: 50 * 60 } as never,
    1,
  );

  const r = editarToqueTool(
    { idToque: toque.idToque, motivo: 'reconfirmando lo mismo', duracionSegundos: 3000, quePaso: 'quedaron de mandar el contrato' },
    1,
  );

  assert.deepEqual(
    r.cambios.map((c) => c.campo),
    ['quePaso'],
    'la duracion llego con el valor que ya tenia: no es un cambio',
  );
});

test('editarToqueTool con un parche que no mueve nada devuelve sinCambios y no escribe bitacora', () => {
  seedEmpresa('e4');
  const { toque } = registrarToqueTool(
    { idEmpresa: 'e4', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-07-22' } as never,
    1,
  );

  const r = editarToqueTool({ idToque: toque.idToque, motivo: 'sin novedad', canal: 'llamada' }, 1);
  assert.equal(r.sinCambios, true);
  assert.deepEqual(r.cambios, []);

  const raw = new Database(dbPath);
  const n = raw
    .prepare(`SELECT count(*) AS n FROM sync_cambios WHERE entidad = 'toque' AND accion = 'update' AND id_registro = ?`)
    .get(String(toque.idToque)) as any;
  raw.close();
  assert.equal(n.n, 0, 'sin cambios no se escribe rastro: la bitacora diria que algo se movio');
});

test('editarToqueTool corrige el dia y mueve fecha_dia junto con el timestamp', () => {
  seedEmpresa('e5');
  const { toque } = registrarToqueTool(
    { idEmpresa: 'e5', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-07-22' } as never,
    1,
  );

  editarToqueTool({ idToque: toque.idToque, motivo: 'el toque fue el lunes, no el miercoles', fecha: '2026-07-20' }, 1);

  const fila = leerToque(toque.idToque);
  assert.equal(fila.fecha_dia, '2026-07-20');
  assert.equal(fila.fecha.slice(0, 10), '2026-07-20', 'el timestamp no puede quedar contradiciendo al dia canonico');
});

// El camino de error que importa: las reglas del toque se reimponen sobre la fila MEZCLADA.
// El parche no nombra la fecha propuesta, y aun asi tiene que fallar.
test('editarToqueTool rechaza un resultado que deja la fila incoherente', () => {
  seedEmpresa('e6');
  const { toque } = registrarToqueTool(
    { idEmpresa: 'e6', canal: 'reunion', resultado: 'reunion_buena', fecha: '2026-07-23' } as never,
    1,
  );

  assert.throws(
    () => editarToqueTool({ idToque: toque.idToque, motivo: 'no llego', resultado: 'no_llego' }, 1),
    /reunionFechaPropuesta/,
  );
  // Y no escribio nada a medias.
  assert.equal(leerToque(toque.idToque).resultado, 'reunion_buena');
});

test('editarToqueTool exige motivo y al menos un campo', () => {
  seedEmpresa('e7');
  const { toque } = registrarToqueTool(
    { idEmpresa: 'e7', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-07-23' } as never,
    1,
  );

  assert.throws(() => editarToqueTool({ idToque: toque.idToque, duracionSegundos: 60 } as never, 1));
  assert.throws(() => editarToqueTool({ idToque: toque.idToque, motivo: 'porque si' }, 1));
});

test('editarToqueTool falla explicito con un toque que no existe o que es de otra organizacion', () => {
  seedEmpresa('e8', 777);
  const { toque } = registrarToqueTool(
    { idEmpresa: 'e8', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-07-23' } as never,
    777,
  );

  assert.throws(() => editarToqueTool({ idToque: 999_999, motivo: 'x', quePaso: 'y' }, 1), /no existe/);
  assert.throws(() => editarToqueTool({ idToque: toque.idToque, motivo: 'x', quePaso: 'y' }, 1), /otra organizacion/);
});

// --- idContacto ------------------------------------------------------------------------

test('registrarToqueTool acepta idContacto y lo deja enlazado en el toque', () => {
  seedEmpresa('c1');
  const idContacto = seedContacto('c1', 'Carlos, el gerente');

  const { toque } = registrarToqueTool(
    { idEmpresa: 'c1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', fecha: '2026-07-24', idContacto } as never,
    1,
  );

  assert.equal(toque.idContacto, idContacto);
  assert.equal(leerToque(toque.idToque).id_contacto, idContacto);
});

test('registrarToqueTool rechaza un contacto de otra empresa en vez de dejar el enlace vacio', () => {
  seedEmpresa('c2');
  seedEmpresa('c3');
  const ajeno = seedContacto('c3', 'la recepcionista de otra cuenta');

  assert.throws(
    () =>
      registrarToqueTool(
        { idEmpresa: 'c2', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-07-24', idContacto: ajeno } as never,
        1,
      ),
    /no existe o no pertenece/,
  );
});

test('registrarToqueTool rechaza idContacto y kdm juntos: no se elige uno en silencio', () => {
  seedEmpresa('c4');
  const idContacto = seedContacto('c4', 'Carlos');

  assert.throws(() =>
    registrarToqueTool(
      {
        idEmpresa: 'c4',
        canal: 'llamada',
        resultado: 'no_contesto',
        fecha: '2026-07-24',
        idContacto,
        kdm: { nombre: 'otro Carlos' },
      } as never,
      1,
    ),
  );
});

test('editarToqueTool enlaza a la persona un toque que quedo sin contacto, y null lo desenlaza', () => {
  seedEmpresa('c5');
  const idContacto = seedContacto('c5', 'Carlos, el gerente');
  const { toque } = registrarToqueTool(
    { idEmpresa: 'c5', canal: 'llamada', resultado: 'no_contesto', fecha: '2026-07-24' } as never,
    1,
  );
  assert.equal(toque.idContacto, null);

  const r = editarToqueTool({ idToque: toque.idToque, motivo: 'era el gerente, no la recepcion', idContacto }, 1);
  assert.equal(r.toque.idContacto, idContacto);

  const vuelta = editarToqueTool({ idToque: toque.idToque, motivo: 'me equivoque de persona', idContacto: null }, 1);
  assert.equal(vuelta.toque.idContacto, null);
});

test.after(() => borrarDbPrueba(dbPath));
