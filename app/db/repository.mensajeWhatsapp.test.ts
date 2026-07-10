// Tarea 6: primitivas de repository para la respuesta entrante de WhatsApp. Prueba lo que
// el core no puede con deps falsos: el match real telefono->contacto->organizacion, la
// idempotencia real de guardarMensajeEntrante (indice UNIQUE de mensaje_whatsapp), el join
// de inscripcionesActivasDeEmpresa y el insert de registrarToqueEntrante.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  candidatosContactoConTelefono,
  guardarMensajeEntrante,
  inscripcionesActivasDeEmpresa,
  registrarToqueEntrante,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

// empresa + contacto con telefono (formateado a proposito) y email.
{
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id)
     VALUES ('emp-wa','nit','Emp WA','emp wa','activo','on_hold','wa-cat',1)`,
  ).run();
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, email, fuente)
     VALUES ('emp-wa','Ana',0,1,'+57 302 248 2292','ana@x.com','seed')`,
  ).run();
  db.close();
}

const idCadencia = crearCadencia({ nombre: 'C wa', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x' }] });
const idSegmento = guardarSegmento(
  { nombre: 'wa-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['wa-cat'] }] } },
  1,
);
const idCampana = crearCampana({ nombre: 'Camp wa', idCadencia, idSegmento });
{
  const db = raw();
  db.prepare('UPDATE campana SET proveedor_campana_id = ? WHERE id_campana = ?').run('seq-wa', idCampana);
  db.close();
}
inscribirCampana(idCampana, 1);

function idContactoDeEmpWa(): number {
  const db = raw();
  const r = db.prepare(`SELECT id_contacto FROM contacto WHERE id_empresa='emp-wa'`).get() as { id_contacto: number };
  db.close();
  return r.id_contacto;
}

test('candidatosContactoConTelefono trae el contacto con su telefono y organizacion', () => {
  const cs = candidatosContactoConTelefono();
  const ana = cs.find((c) => c.idEmpresa === 'emp-wa');
  assert.ok(ana, 'deberia incluir el contacto de emp-wa');
  assert.equal(ana.telefono, '+57 302 248 2292');
  assert.equal(ana.idOrganizacion, 1);
});

test('inscripcionesActivasDeEmpresa devuelve la inscripcion activa con secuencia y email', () => {
  const activas = inscripcionesActivasDeEmpresa('emp-wa');
  assert.equal(activas.length, 1);
  assert.equal(activas[0].proveedorCampanaId, 'seq-wa');
  assert.equal(activas[0].email, 'ana@x.com');
  assert.ok(activas[0].idInscripcion > 0);
});

test('guardarMensajeEntrante es idempotente por mensaje_id', () => {
  const mensaje = {
    referenciaProveedor: 'prueba',
    telefono: '573022482292',
    texto: 'Si me interesa',
    mensajeId: 'MSG-UNICO-1',
    fecha: '2026-07-09T22:51:38.586Z',
  };
  const idc = idContactoDeEmpWa();
  assert.equal(guardarMensajeEntrante(mensaje, idc), 'insertado');
  assert.equal(guardarMensajeEntrante(mensaje, idc), 'duplicado');

  const db = raw();
  const fila = db.prepare(`SELECT texto, id_contacto FROM mensaje_whatsapp WHERE mensaje_id='MSG-UNICO-1'`).get() as {
    texto: string;
    id_contacto: number;
  };
  db.close();
  assert.equal(fila.texto, 'Si me interesa');
  assert.equal(fila.id_contacto, idc);
});

test('registrarToqueEntrante deja un toque fuente whatsapp_entrante en la empresa', () => {
  registrarToqueEntrante(
    { idContacto: idContactoDeEmpWa(), idEmpresa: 'emp-wa', idOrganizacion: 1 },
    'Dale, hablemos manana',
    '2026-07-09T23:00:00.000Z',
  );
  const db = raw();
  const t = db
    .prepare(`SELECT canal, que_paso, fuente, id_organizacion FROM toque WHERE id_empresa='emp-wa' AND fuente='whatsapp_entrante'`)
    .get() as { canal: string; que_paso: string; fuente: string; id_organizacion: number };
  db.close();
  assert.equal(t.canal, 'whatsapp');
  assert.equal(t.que_paso, 'Dale, hablemos manana');
  assert.equal(t.id_organizacion, 1);
});
