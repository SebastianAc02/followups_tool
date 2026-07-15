// Gmail Etapa 2 (2026-07-15): funciones de resolucion dueno<->Gmail y conteo diario
// que usa registro-envio.ts para armar los grupos de push por adaptador.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  gmailVerificadoDe,
  idUsuarioDeOwner,
  marcarCampanaAprobadaGmail,
  enviosGmailHoy,
  crearCadencia,
  guardarSegmento,
  crearCampana,
  fijarOwnerCampana,
  crearPasoInscripcionPendiente,
  marcarPasoInscripcionEnviada,
  inscribirCampana,
  destinatariosDeInscripcion,
  historialInscripciones,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedOrganizacionMiembro(idOrganizacion: number, ownerCanonico: string, idUser: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (?, ?, ?, ?)`,
  ).run(idOrganizacion, ownerCanonico, ownerCanonico, idUser);
  db.close();
}

function seedConector(proveedor: string, idUsuario: string, ultimoResultado: string | null) {
  const db = raw();
  db.prepare(
    `INSERT INTO conector (proveedor, id_usuario, credencial_ciphertext, estado, ultimo_resultado) VALUES (?, ?, 'x', 'con_credencial', ?)`,
  ).run(proveedor, idUsuario, ultimoResultado);
  db.close();
}

function seedEmpresa(id: string, categoria: string, contactos: { email: string; principal?: boolean }[]) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id) VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?, 1)`,
  ).run(id, id, id.toLowerCase(), categoria);
  for (const c of contactos) {
    db.prepare(
      `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES (?, 'Contacto', 0, ?, ?, 'seed')`,
    ).run(id, c.principal ? 1 : 0, c.email);
  }
  db.close();
}

seedOrganizacionMiembro(1, 'Ana Gmail', 'user-ana');
seedOrganizacionMiembro(1, 'Beto SinGmail', 'user-beto');
seedConector('gmail', 'user-ana', 'ok');
seedConector('gmail', 'user-beto', 'error: credencial invalida');

test('idUsuarioDeOwner resuelve owner_canonico -> id_user dentro de la organizacion', () => {
  assert.equal(idUsuarioDeOwner('Ana Gmail', 1), 'user-ana');
});

test('idUsuarioDeOwner con owner null devuelve null', () => {
  assert.equal(idUsuarioDeOwner(null, 1), null);
});

test('idUsuarioDeOwner con owner que no existe en esa organizacion devuelve null', () => {
  assert.equal(idUsuarioDeOwner('Ana Gmail', 2), null);
});

test('gmailVerificadoDe es true solo con credencial Y ultimo_resultado=ok', () => {
  assert.equal(gmailVerificadoDe('user-ana'), true);
  assert.equal(gmailVerificadoDe('user-beto'), false);
  assert.equal(gmailVerificadoDe('user-sin-conector'), false);
});

// -- marcarCampanaAprobadaGmail + enviosGmailHoy: necesitan una campana/inscripcion real --
const idCadencia = crearCadencia({ nombre: 'C gmail', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x' }] });
const idSegmento = guardarSegmento(
  { nombre: 'gmail-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['gmail-cat-1'] }] } },
  1,
);
const idCampana = crearCampana({ nombre: 'Camp gmail', idCadencia, idSegmento }, 1);
fijarOwnerCampana(idCampana, 'Ana Gmail');

test('marcarCampanaAprobadaGmail deja la columna en 1', () => {
  marcarCampanaAprobadaGmail(idCampana);
  const db = raw();
  const fila = db.prepare('SELECT aprobada_envio_gmail FROM campana WHERE id_campana = ?').get(idCampana) as any;
  db.close();
  assert.equal(fila.aprobada_envio_gmail, 1);
});

test('enviosGmailHoy cuenta solo pasos enviados por gmail, hoy, del dueno resuelto', () => {
  const hoy = new Date().toISOString();

  assert.equal(enviosGmailHoy('user-ana', 1, hoy.slice(0, 10)), 0);

  seedEmpresa('e-gmail-conteo', 'gmail-cat-1', [{ email: 'ana@empresa.com', principal: true }]);

  inscribirCampana(idCampana, 1);
  const hist = historialInscripciones('e-gmail-conteo').find((i) => i.estado === 'activa')!;
  const idInscripcion = hist.id;
  const idDestinatario = destinatariosDeInscripcion(idInscripcion)[0]?.id;
  assert.ok(idDestinatario, 'la inscripcion deberia tener al menos un destinatario');

  const idPaso1 = crearPasoInscripcionPendiente({ idDestinatario, idPaso: 1, idVersion: 1, canal: 'correo' });
  marcarPasoInscripcionEnviada(idPaso1, 'gmail', 'msg-1', hoy);

  assert.equal(enviosGmailHoy('user-ana', 1, hoy.slice(0, 10)), 1);
  assert.equal(enviosGmailHoy('user-beto', 1, hoy.slice(0, 10)), 0, 'no cuenta envios de otro dueno');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
