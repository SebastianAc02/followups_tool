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

function idsPasoYVersion(idCadencia: number) {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as any;
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as any;
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

function seedEmpresa(id: string, categoria: string, contactos: { email: string; principal?: boolean }[], idOrganizacion = 1) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id) VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?, ?)`,
  ).run(id, id, id.toLowerCase(), categoria, idOrganizacion);
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
  { nombre: 'gmail-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }] } },
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

  seedEmpresa('e-gmail-conteo', 'isp', [{ email: 'ana@empresa.com', principal: true }]);

  inscribirCampana(idCampana, 1);
  const hist = historialInscripciones('e-gmail-conteo').find((i) => i.estado === 'activa')!;
  const idInscripcion = hist.id;
  const idDestinatario = destinatariosDeInscripcion(idInscripcion)[0]?.id;
  assert.ok(idDestinatario, 'la inscripcion deberia tener al menos un destinatario');

  const { idPaso, idVersion } = idsPasoYVersion(idCadencia);
  const idPaso1 = crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });
  marcarPasoInscripcionEnviada(idPaso1, 'gmail', 'msg-1', hoy);

  assert.equal(enviosGmailHoy('user-ana', 1, hoy.slice(0, 10)), 1);
  assert.equal(enviosGmailHoy('user-beto', 1, hoy.slice(0, 10)), 0, 'no cuenta envios de otro dueno');
});

// Code review (2026-07-15): mismo bug ya encontrado en lineaWhatsappActivaDeOwner --
// owner_canonico no es unico globalmente, la llave real es (id_organizacion,
// owner_canonico). Dos organizaciones distintas con el MISMO nombre de owner no deben
// mezclar sus conteos de envio.
test('enviosGmailHoy no mezcla organizaciones distintas con el mismo owner_canonico', () => {
  const hoy = new Date().toISOString();

  seedOrganizacionMiembro(2, 'Ana Gmail', 'user-ana-org2');
  seedConector('gmail', 'user-ana-org2', 'ok');

  const idCadenciaOrg2 = crearCadencia({ nombre: 'C gmail org2', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x' }] });
  const idSegmentoOrg2 = guardarSegmento(
    { nombre: 'gmail-seg-org2', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }] } },
    2,
  );
  const idCampanaOrg2 = crearCampana({ nombre: 'Camp gmail org2', idCadencia: idCadenciaOrg2, idSegmento: idSegmentoOrg2 }, 2);
  fijarOwnerCampana(idCampanaOrg2, 'Ana Gmail');

  seedEmpresa('e-gmail-conteo-org2', 'isp', [{ email: 'ana2@empresa.com', principal: true }], 2);

  inscribirCampana(idCampanaOrg2, 2);
  const histOrg2 = historialInscripciones('e-gmail-conteo-org2').find((i) => i.estado === 'activa')!;
  const idDestinatarioOrg2 = destinatariosDeInscripcion(histOrg2.id)[0]?.id;
  assert.ok(idDestinatarioOrg2, 'la inscripcion de org2 deberia tener al menos un destinatario');

  const { idPaso: idPasoOrg2Def, idVersion: idVersionOrg2 } = idsPasoYVersion(idCadenciaOrg2);
  const idPasoOrg2 = crearPasoInscripcionPendiente({ idDestinatario: idDestinatarioOrg2, idPaso: idPasoOrg2Def, idVersion: idVersionOrg2, canal: 'correo' });
  marcarPasoInscripcionEnviada(idPasoOrg2, 'gmail', 'msg-org2-1', hoy);

  // org2 cuenta su propio envio...
  assert.equal(enviosGmailHoy('user-ana-org2', 2, hoy.slice(0, 10)), 1);
  // ...pero no se filtra hacia el conteo de org1, que sigue en 1 (del test anterior).
  assert.equal(enviosGmailHoy('user-ana', 1, hoy.slice(0, 10)), 1, 'el envio de org2 no deberia sumar al conteo de org1');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
