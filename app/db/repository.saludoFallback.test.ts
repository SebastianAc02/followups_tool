// Incidente ConmuTV (2026-08-25): dos campañas, ~126 correos, 100% salieron con el saludo
// literal "Hola [nombre]," sin sustituir. Causa real, verificada leyendo el join: el correo
// automático de campaña (a diferencia de whatsapp, que exige revisión humana antes de salir)
// nunca pasaba por renderizarCopy -- pasoInscripcionesPendientes devolvía version_paso.cuerpo
// tal cual, plantilla cruda, sin importar si el contacto tenía nombre o no.
//
// Esta prueba fija el fallback de saludo (contacto principal -> representante legal ->
// representante legal suplente -> nombre de la empresa) Y que ese render de verdad ocurra en
// el camino real que push.ts consume (pasoInscripcionesPendientes), no solo en una función
// aislada que nadie llama.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  historialInscripciones,
  destinatariosDeInscripcion,
  crearPasoInscripcionPendiente,
  pasoInscripcionesPendientes,
  nombreParaSaludo,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function idsPasoYVersion(idCadencia: number) {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as { id_paso: number };
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as { id_version: number };
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

function idDestinatarioDe(idEmpresa: string): number {
  const h = historialInscripciones(idEmpresa).find((i) => i.estado === 'activa')!;
  return destinatariosDeInscripcion(h.id)[0].id;
}

function seedEmpresaSinNombreDeContacto(id: string, ciudad: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?, 1)`,
  ).run(id, id, id, ciudad);
  // El contacto que recibe el correo, tal como llega de un import masivo (ConmuTV): SIN
  // nombre. Este es el caso real que produjo el bug -- no un contacto con nombre raro.
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, telefono, fuente)
     VALUES (?, NULL, 0, 1, ?, '573000000001', 'seed')`,
  ).run(id, `${id}@empresa.com`);
  db.close();
}

function agregarRepLegal(idEmpresa: string, nombre: string, cargoCategoria: 'rep_legal' | 'rep_legal_suplente') {
  const db = raw();
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente, cargo, cargo_categoria)
     VALUES (?, ?, 0, 0, NULL, 'seed', 'Representante Legal', ?)`,
  ).run(idEmpresa, nombre, cargoCategoria);
  db.close();
}

function crearCampanaDeCorreo(idEmpresa: string, ciudad: string) {
  const idCadencia = crearCadencia({
    nombre: `C ${idEmpresa}`,
    pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola [nombre],', cuerpo: 'Hola [nombre], una pregunta rápida.' }],
  });
  const idSegmento = guardarSegmento(
    { nombre: `seg-${idEmpresa}`, definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: [ciudad] }] } },
    1,
  );
  const { idPaso, idVersion } = idsPasoYVersion(idCadencia);
  const idCampana = crearCampana({ nombre: `Camp ${idEmpresa}`, idCadencia, idSegmento }, 1);
  const db = raw();
  db.prepare('UPDATE campana SET proveedor_campana_id = ? WHERE id_campana = ?').run(`seq-${idEmpresa}`, idCampana);
  db.close();
  inscribirCampana(idCampana, 1);
  const idPasoIns = crearPasoInscripcionPendiente({
    idDestinatario: idDestinatarioDe(idEmpresa),
    idPaso,
    idVersion,
    canal: 'correo',
  });
  return idPasoIns;
}

// --- nombreParaSaludo aislado ------------------------------------------------------------

test('nombreParaSaludo usa el nombre del contacto si es usable', () => {
  assert.equal(nombreParaSaludo('e-cualquiera', 'Hidaly', 'Giganav SAS'), 'Hidaly');
});

test('nombreParaSaludo cae al nombre de la empresa cuando el contacto trae su propio nombre de empresa (import roto)', () => {
  seedEmpresaSinNombreDeContacto('e-saludo-generico', 'ciudad-generico');
  assert.equal(nombreParaSaludo('e-saludo-generico', 'e-saludo-generico', 'e-saludo-generico'), 'e-saludo-generico');
});

// --- el caso real: sin nombre de contacto, CON representante legal -----------------------

test('sin nombre de contacto, con representante legal en la tabla contacto: el saludo cae al rep legal', () => {
  seedEmpresaSinNombreDeContacto('e-rep-legal', 'ciudad-rep-legal');
  agregarRepLegal('e-rep-legal', 'Carlos Ramírez', 'rep_legal');

  const idPasoIns = crearCampanaDeCorreo('e-rep-legal', 'ciudad-rep-legal');
  const fila = pasoInscripcionesPendientes('correo').find((f) => f.idPasoInscripcion === idPasoIns);

  assert.ok(fila);
  assert.equal(fila!.paso.asunto, 'Hola Carlos Ramírez,');
  assert.equal(fila!.paso.cuerpo, 'Hola Carlos Ramírez, una pregunta rápida.');
});

test('sin rep_legal pero con rep_legal_suplente: el saludo cae al suplente', () => {
  seedEmpresaSinNombreDeContacto('e-rep-suplente', 'ciudad-rep-suplente');
  agregarRepLegal('e-rep-suplente', 'Marta Gómez', 'rep_legal_suplente');

  const idPasoIns = crearCampanaDeCorreo('e-rep-suplente', 'ciudad-rep-suplente');
  const fila = pasoInscripcionesPendientes('correo').find((f) => f.idPasoInscripcion === idPasoIns);

  assert.ok(fila);
  assert.equal(fila!.paso.cuerpo, 'Hola Marta Gómez, una pregunta rápida.');
});

// --- el fondo del pozo: tampoco hay rep legal ---------------------------------------------

test('sin nombre de contacto y sin ningun representante legal: el saludo cae al nombre de la empresa, nunca al placeholder crudo', () => {
  seedEmpresaSinNombreDeContacto('e-sin-nadie', 'ciudad-sin-nadie');

  const idPasoIns = crearCampanaDeCorreo('e-sin-nadie', 'ciudad-sin-nadie');
  const fila = pasoInscripcionesPendientes('correo').find((f) => f.idPasoInscripcion === idPasoIns);

  assert.ok(fila);
  assert.equal(fila!.paso.cuerpo, 'Hola e-sin-nadie, una pregunta rápida.');
  assert.ok(!fila!.paso.cuerpo.includes('[nombre]'), 'el placeholder crudo NUNCA sobrevive hasta el texto que push.ts entrega al adaptador');
  assert.ok(!fila!.paso.asunto?.includes('[nombre]'));
});

// --- copy ya revisado por un humano: no se vuelve a renderizar encima --------------------

test('si el paso ya tiene cuerpoFinal (revisado a mano), pasoInscripcionesPendientes lo respeta tal cual', () => {
  seedEmpresaSinNombreDeContacto('e-ya-revisado', 'ciudad-ya-revisado');
  const idPasoIns = crearCampanaDeCorreo('e-ya-revisado', 'ciudad-ya-revisado');

  const db = raw();
  db.prepare('UPDATE paso_inscripcion SET cuerpo_final = ? WHERE id_paso_inscripcion = ?').run('Texto que Sebastian ya escribió a mano.', idPasoIns);
  db.close();

  const fila = pasoInscripcionesPendientes('correo').find((f) => f.idPasoInscripcion === idPasoIns);
  assert.ok(fila);
  assert.equal(fila!.paso.cuerpo, 'Texto que Sebastian ya escribió a mano.');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
