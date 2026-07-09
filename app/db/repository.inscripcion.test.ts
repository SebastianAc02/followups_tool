// V4.5: pruebas de inscripcion de campana en la DB. Cubre los 4 destinatarios default
// (KDM, principal, primero, bloqueada) y el cambio de campana con historial.

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
  inscripcionesBloqueadas,
  destinatariosDeInscripcion,
  resolverInscripcionBloqueada,
  excluirDeSegmento,
  listarCampanas,
  eliminarCampanaBorrador,
  pausarCampana,
  reanudarCampana,
  marcarCampanaFinalizada,
} = await import('./repository.ts');

// Seed: 4 empresas isp on_hold con distintos perfiles de contactos.
function seed() {
  const raw = new Database(dbPath);
  const emp = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'isp')`,
  );
  const con = raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente)
     VALUES (?, ?, ?, ?, ?, 'seed')`,
  );
  // e-kdm: tiene KDM con email (y otros)
  emp.run('e-kdm', 'ConKDM', 'conkdm');
  con.run('e-kdm', 'Principal', 0, 1, 'ppal@x.com');
  con.run('e-kdm', 'ElKDM', 1, 0, 'kdm@x.com');
  // e-ppal: sin KDM, principal con email
  emp.run('e-ppal', 'ConPrincipal', 'conprincipal');
  con.run('e-ppal', 'Primero', 0, 0, 'primero@x.com');
  con.run('e-ppal', 'Principal', 0, 1, 'ppal@x.com');
  // e-primero: sin KDM ni principal, primero con email gana
  emp.run('e-primero', 'ConPrimero', 'conprimero');
  con.run('e-primero', 'Uno', 0, 0, 'uno@x.com');
  con.run('e-primero', 'Dos', 0, 0, 'dos@x.com');
  // e-bloq: KDM sin email -> bloqueada
  emp.run('e-bloq', 'SinEmail', 'sinemail');
  con.run('e-bloq', 'KDMsinmail', 1, 0, null);
  raw.close();
}
seed();

const idCadencia = crearCadencia({ nombre: 'C', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
const idSegmento = guardarSegmento({ nombre: 'on-hold', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);

function contactoEmail(idContacto: number): string | null {
  const raw = new Database(dbPath);
  const r = raw.prepare('SELECT email FROM contacto WHERE id_contacto = ?').get(idContacto) as any;
  raw.close();
  return r?.email ?? null;
}

test('inscribir cubre los 4 defaults: 3 activas (KDM/principal/primero) + 1 bloqueada', () => {
  const idCampana = crearCampana({ nombre: 'Camp A', idCadencia, idSegmento });
  const res = inscribirCampana(idCampana);

  assert.equal(res.inscritas, 3);
  assert.equal(res.bloqueadas, 1);
  assert.equal(res.reemplazos, 0);

  // e-kdm -> destinatario es el KDM (kdm@x.com)
  const hKdm = historialInscripciones('e-kdm');
  assert.equal(hKdm.length, 1);
  assert.equal(hKdm[0].estado, 'activa');
  const dKdm = destinatariosDeInscripcion(hKdm[0].id);
  assert.equal(contactoEmail(dKdm[0].idContacto), 'kdm@x.com');

  // e-ppal -> el principal
  const dPpal = destinatariosDeInscripcion(historialInscripciones('e-ppal')[0].id);
  assert.equal(contactoEmail(dPpal[0].idContacto), 'ppal@x.com');

  // e-primero -> el primero con email
  const dPrimero = destinatariosDeInscripcion(historialInscripciones('e-primero')[0].id);
  assert.equal(contactoEmail(dPrimero[0].idContacto), 'uno@x.com');

  // e-bloq -> bloqueada, sin destinatario
  const hBloq = historialInscripciones('e-bloq');
  assert.equal(hBloq[0].estado, 'bloqueada');
  assert.equal(destinatariosDeInscripcion(hBloq[0].id).length, 0);
});

test('re-correr la misma campana es idempotente: todo saltado, sin duplicar', () => {
  const idCampana = crearCampana({ nombre: 'Camp A2', idCadencia, idSegmento });
  inscribirCampana(idCampana);
  const otra = inscribirCampana(idCampana);
  assert.equal(otra.saltadas, 4);
  assert.equal(otra.inscritas, 0);
});

test('cambio de campana: la empresa sale de la anterior con motivo_fin y deja historial', () => {
  // e-kdm ya tiene una activa (Camp A). Nueva campana sobre el mismo segmento.
  const idCampanaB = crearCampana({ nombre: 'Camp B', idCadencia, idSegmento });
  const res = inscribirCampana(idCampanaB);
  assert.ok(res.reemplazos >= 1, 'al menos las activas previas se reemplazan');

  const h = historialInscripciones('e-kdm');
  // una finalizada (la vieja) + una activa (la nueva)
  const finalizadas = h.filter((i) => i.estado === 'finalizada');
  const activas = h.filter((i) => i.estado === 'activa');
  assert.equal(activas.length, 1, 'solo una activa por empresa');
  assert.ok(finalizadas.length >= 1, 'la anterior quedo en el historial');
  assert.equal(finalizadas.at(-1)!.motivoFin, 'cambio de campana');
});

test('resolver con un contacto de OTRA empresa es rechazado (no adjunta ajenos)', () => {
  const deBloq = inscripcionesBloqueadas().find((b) => b.idEmpresa === 'e-bloq');
  assert.ok(deBloq);
  // un contacto de e-kdm no pertenece a e-bloq
  const raw = new Database(dbPath);
  const ajeno = raw.prepare(`SELECT id_contacto FROM contacto WHERE id_empresa = 'e-kdm' LIMIT 1`).get() as any;
  raw.close();
  assert.throws(() => resolverInscripcionBloqueada(deBloq!.id, ajeno.id_contacto), /no pertenece a la empresa/);
  // sigue bloqueada tras el throw
  assert.equal(historialInscripciones('e-bloq').find((i) => i.id === deBloq!.id)!.estado, 'bloqueada');
});

test('resolver una bloqueada la promueve a activa con su destinatario', () => {
  const bloqueadas = inscripcionesBloqueadas();
  const deBloq = bloqueadas.find((b) => b.idEmpresa === 'e-bloq');
  assert.ok(deBloq);

  // agrega un contacto con email a e-bloq y resuelve a mano
  const raw = new Database(dbPath);
  const ins = raw.prepare(`INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES ('e-bloq','Nuevo',0,0,'nuevo@x.com','manual')`).run();
  raw.close();

  resolverInscripcionBloqueada(deBloq!.id, Number(ins.lastInsertRowid));

  const h = historialInscripciones('e-bloq');
  const activa = h.find((i) => i.id === deBloq!.id);
  assert.equal(activa!.estado, 'activa');
  assert.equal(destinatariosDeInscripcion(deBloq!.id).length, 1);
});

// Parte 3 campanas: el "esta no va" de la revision de leads (Parte 2) se respeta al
// inscribir. Va al final del archivo: excluir es permanente para el segmento
// compartido de este archivo, no debe interferir con las aserciones de arriba.
test('empresa excluida en la revision de leads no se inscribe en una campana nueva', () => {
  excluirDeSegmento(idSegmento, 'e-primero');
  const idCampanaC = crearCampana({ nombre: 'Camp C', idCadencia, idSegmento });
  const res = inscribirCampana(idCampanaC);

  const hPrimero = historialInscripciones('e-primero');
  assert.ok(!hPrimero.some((i) => i.idCampana === idCampanaC), 'e-primero excluida no entra a Camp C');

  // las no excluidas si entran (reemplazando su activa de la campana anterior)
  const hKdm = historialInscripciones('e-kdm');
  assert.ok(hKdm.some((i) => i.idCampana === idCampanaC && i.estado === 'activa'));
  assert.ok(res.reemplazos >= 1);
});

// Parte 4 campanas: campana.estado pasa de 'borrador' a 'activa' al inscribir (antes
// se quedaba en 'borrador' para siempre, un vacio real del estado de la campana).
test('crearCampana nace borrador; inscribirCampana la pasa a activa', () => {
  const idCampanaD = crearCampana({ nombre: 'Camp D', idCadencia, idSegmento });
  assert.equal(listarCampanas().find((f) => f.nombre === 'Camp D')!.estado, 'borrador');
  inscribirCampana(idCampanaD);
  assert.equal(listarCampanas().find((f) => f.nombre === 'Camp D')!.estado, 'activa');
});

// Parte 4 campanas: hub de campanas (pantalla /campanas). Trae nombre de cadencia y
// segmento resueltos (no solo los ids) para no armar el join en la UI.
test('listarCampanas trae nombre de cadencia y segmento, mas conteo de inscritas', () => {
  // Camp D es la ultima creada en este archivo: nada mas la supera todavia, asi que
  // "inscritas" (activas AHORA MISMO en esta campana) es un conteo estable de verdad.
  // Camp A ya fue reemplazada por campanas posteriores sobre el mismo segmento: sus
  // inscripciones pasaron a 'finalizada', y por eso inscritas=0 es lo correcto ahi.
  const filas = listarCampanas();
  const cD = filas.find((f) => f.nombre === 'Camp D');
  assert.ok(cD);
  assert.equal(cD!.cadencia, 'C');
  assert.equal(cD!.segmento, 'on-hold');
  assert.equal(cD!.estado, 'activa');
  assert.ok(cD!.inscritas >= 1);
});

// Parte 5 campanas: reglaFaltante e intakeDiario se persisten y se leen de vuelta.
test('crearCampana persiste reglaFaltante e intakeDiario', () => {
  const idCampanaE = crearCampana({ nombre: 'Camp E', idCadencia, idSegmento, reglaFaltante: 'saltar', intakeDiario: 50 });
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT regla_faltante, intake_diario FROM campana WHERE id_campana = ?').get(idCampanaE) as any;
  raw.close();
  assert.equal(fila.regla_faltante, 'saltar');
  assert.equal(fila.intake_diario, 50);
});

// Fase 7 (gestion de drafts): un borrador que nunca corrio inscribirCampana no deja
// rastro -- se borra campana + su propia cadencia (nadie mas la usa).
test('eliminarCampanaBorrador borra campana y cadencia si sigue en borrador', () => {
  const idCadenciaF = crearCadencia({ nombre: 'CF', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
  const idCampanaF = crearCampana({ nombre: 'Camp F', idCadencia: idCadenciaF, idSegmento });
  const res = eliminarCampanaBorrador(idCampanaF);
  assert.equal(res.ok, true);
  assert.equal(listarCampanas().find((f) => f.nombre === 'Camp F'), undefined);
  const raw = new Database(dbPath);
  const cad = raw.prepare('SELECT id_cadencia FROM cadencia WHERE id_cadencia = ?').get(idCadenciaF);
  raw.close();
  assert.equal(cad, undefined);
});

// No es seguro borrar una campana que ya inscribio de verdad: perderia inscripciones
// y toques reales sin aviso. inscribirCampana la saca de 'borrador' Y crea las
// inscripciones en el mismo paso, asi que un solo test cubre las dos guardas.
test('eliminarCampanaBorrador rechaza una campana que ya no esta en borrador', () => {
  const idCadenciaG = crearCadencia({ nombre: 'CG', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
  const idCampanaG = crearCampana({ nombre: 'Camp G', idCadencia: idCadenciaG, idSegmento });
  inscribirCampana(idCampanaG);
  const res = eliminarCampanaBorrador(idCampanaG);
  assert.equal(res.ok, false);
  assert.ok(listarCampanas().find((f) => f.nombre === 'Camp G'));
});

// Fase 7 (ciclo de vida): pausar/reanudar son reversibles y solo se mueven entre
// 'activa' <-> 'pausada'; cualquier otro origen se rechaza para no pisar un borrador
// o una campana ya finalizada.
test('pausarCampana/reanudarCampana solo se mueven entre activa y pausada', () => {
  const idCadenciaH = crearCadencia({ nombre: 'CH', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
  const idCampanaH = crearCampana({ nombre: 'Camp H', idCadencia: idCadenciaH, idSegmento });

  assert.equal(pausarCampana(idCampanaH).ok, false, 'no se puede pausar un borrador');

  inscribirCampana(idCampanaH);
  assert.equal(reanudarCampana(idCampanaH).ok, false, 'no se puede reanudar algo que no esta pausado');

  const p = pausarCampana(idCampanaH);
  assert.equal(p.ok, true);
  assert.equal(listarCampanas().find((f) => f.nombre === 'Camp H')!.estado, 'pausada');

  const r = reanudarCampana(idCampanaH);
  assert.equal(r.ok, true);
  assert.equal(listarCampanas().find((f) => f.nombre === 'Camp H')!.estado, 'activa');
});

// marcarCampanaFinalizada es lo unico que "Cancelar" toca en la base (el archivado
// real en Apollo lo hace la server action, fuera del repository). Un borrador se
// elimina (eliminarCampanaBorrador), no se cancela -- por eso lo rechaza.
test('marcarCampanaFinalizada rechaza un borrador y una campana ya finalizada', () => {
  const idCadenciaI = crearCadencia({ nombre: 'CI', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
  const idCampanaI = crearCampana({ nombre: 'Camp I', idCadencia: idCadenciaI, idSegmento });

  assert.equal(marcarCampanaFinalizada(idCampanaI).ok, false, 'un borrador se elimina, no se cancela');

  inscribirCampana(idCampanaI);
  const primera = marcarCampanaFinalizada(idCampanaI);
  assert.equal(primera.ok, true);
  assert.equal(listarCampanas().find((f) => f.nombre === 'Camp I')!.estado, 'finalizada');

  assert.equal(marcarCampanaFinalizada(idCampanaI).ok, false, 'ya esta finalizada');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
