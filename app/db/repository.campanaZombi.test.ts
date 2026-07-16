// "Campana zombi": una inscripcion 'activa' colgando de una campana 'archivada'.
// materializarPasosDebidos exige AMBAS activas (inner join, ver repository.ts), asi que
// esa inscripcion queda viva e invisible: nadie la trabaja y nada la cierra.
//
// Reportado el 2026-07-15 como "relanzar una campana cancelada la deja zombi". Medido:
// relanzar NO es el camino (inscribirCampana reactiva la campana; ver el primer test,
// que queda como regresion). El camino real es la cola de revision.

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
  marcarCampanaFinalizada,
  historialInscripciones,
  inscripcionesBloqueadas,
  completarContactoYResolver,
  archivarCampanasCompletadas,
} = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  const emp = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, ciudad_principal)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'isp', ?)`,
  );
  const con = raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente)
     VALUES (?, ?, 0, 1, ?, 'seed')`,
  );
  // Una empresa por test (la DB es compartida entre tests de este archivo), separadas
  // por ciudad porque el segmento solo filtra por campos del schema, no por nombre.
  emp.run('e-ok', 'ConEmail', 'conemail', 'Cali');
  con.run('e-ok', 'Principal', 'ppal@x.com');
  emp.run('e-zombi', 'SinEmail', 'sinemail', 'Pasto');
  con.run('e-zombi', 'Nadie', null);
  emp.run('e-zombi2', 'SinEmail2', 'sinemail2', 'Neiva');
  con.run('e-zombi2', 'Nadie2', null);
  emp.run('e-zombi3', 'SinEmail3', 'sinemail3', 'Tunja');
  con.run('e-zombi3', 'Nadie3', null);
  raw.close();
}
seed();

const idCadencia = crearCadencia({ nombre: 'C', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
const segOk = guardarSegmento({ nombre: 'solo-ok', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['Cali'] }] } }, 1);
const segZombi = guardarSegmento({ nombre: 'solo-zombi', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['Pasto'] }] } }, 1);
const segZombi2 = guardarSegmento({ nombre: 'solo-zombi2', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['Neiva'] }] } }, 1);
const segZombi3 = guardarSegmento({ nombre: 'solo-zombi3', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['Tunja'] }] } }, 1);

function estadoCampana(idCampana: number): string {
  const raw = new Database(dbPath);
  const r = raw.prepare('SELECT estado FROM campana WHERE id_campana = ?').get(idCampana) as any;
  raw.close();
  return r?.estado;
}

// Regresion: deja fijo que relanzar SI reactiva. Si alguien vuelve a quitar el
// `set estado='activa'` de inscribirCampana, el zombi que se reporto a mano en la demo
// se vuelve real por este camino tambien.
test('relanzar una campana cancelada la deja activa otra vez (no zombi)', () => {
  const idCampana = crearCampana({ nombre: 'Relanzada', idCadencia, idSegmento: segOk }, 1);
  inscribirCampana(idCampana, 1);
  assert.equal(estadoCampana(idCampana), 'activa', 'precondicion: lanzada = activa');

  marcarCampanaFinalizada(idCampana);
  assert.equal(estadoCampana(idCampana), 'archivada', 'precondicion: cancelar archiva');

  inscribirCampana(idCampana, 1);

  assert.equal(estadoCampana(idCampana), 'activa', 'relanzar debe reactivar la campana');
  const activas = historialInscripciones('e-ok').filter((i) => i.estado === 'activa');
  assert.equal(activas.length, 1, 'e-ok queda con exactamente una inscripcion activa');
});

// El camino real del zombi: marcarCampanaFinalizada solo cierra las 'activa'. Una
// 'bloqueada' sobrevive a la cancelacion, la cola de revision la sigue mostrando (no
// filtra por estado de campana) y resolverla la promueve a 'activa' debajo de una
// campana archivada.
// Eslabon 1: cancelar deja la 'bloqueada' viva y la cola la sigue ofreciendo como
// trabajo pendiente, aunque su campana ya no exista para el motor.
test('la cola de revision no muestra bloqueadas de una campana cancelada', () => {
  const idCampana = crearCampana({ nombre: 'Zombi', idCadencia, idSegmento: segZombi }, 1);
  inscribirCampana(idCampana, 1);
  assert.equal(historialInscripciones('e-zombi').filter((i) => i.estado === 'bloqueada').length, 1, 'precondicion: nace bloqueada');

  marcarCampanaFinalizada(idCampana);
  assert.equal(estadoCampana(idCampana), 'archivada');

  const enCola = inscripcionesBloqueadas().filter((b) => b.idCampana === idCampana);
  assert.equal(enCola.length, 0, 'la cola no debe ofrecer trabajo de una campana archivada');
});

// Eslabon 2 (el zombi de verdad): resolverla la promueve a 'activa' debajo de una
// campana 'archivada'. Nadie valida la campana, y el motor exige las dos activas ->
// inscripcion viva que no se materializa nunca y que ademas ocupa el cupo de "una
// activa por empresa" contra el indice unico parcial.
test('resolver una bloqueada de una campana cancelada no deja una inscripcion zombi', () => {
  const idCampana = crearCampana({ nombre: 'Zombi2', idCadencia, idSegmento: segZombi2 }, 1);
  inscribirCampana(idCampana, 1);
  const bloq = historialInscripciones('e-zombi2').filter((i) => i.estado === 'bloqueada');
  assert.equal(bloq.length, 1, 'precondicion: nace bloqueada');

  marcarCampanaFinalizada(idCampana);

  const raw = new Database(dbPath);
  const idContacto = (raw.prepare('SELECT id_contacto FROM contacto WHERE id_empresa = ?').get('e-zombi2') as any).id_contacto;
  raw.close();

  // Resolverla debe o fallar explicito, o dejar algo que el motor de verdad trabaje.
  // Lo que no puede es "exito" + inscripcion activa que nadie mira jamas.
  let rechazada = false;
  try {
    completarContactoYResolver(bloq[0].id, idContacto, { email: 'rescatado@x.com' });
  } catch {
    rechazada = true;
  }

  const activas = historialInscripciones('e-zombi2').filter((i) => i.estado === 'activa');
  if (rechazada) {
    assert.equal(activas.length, 0, 'si se rechaza, no queda nada activo colgando');
    return;
  }
  assert.equal(activas.length, 1, 'quedo activa: entonces la campana tiene que estar activa tambien');
  assert.equal(estadoCampana(idCampana), 'activa', 'una inscripcion activa exige su campana activa (si no, el motor no la ve)');
});

// El camino automatico, y el que de verdad pega en produccion: nadie aprieta Cancelar.
// campanaEstaAgotada ignora las 'bloqueada' a proposito (decision 2026-07-10: una cuenta
// atascada no debe dejar la campana activa para siempre), asi que una campana cuya unica
// inscripcion es una bloqueada se auto-archiva sola -- y archivarCampanasCompletadas no
// cierra ninguna inscripcion. La bloqueada queda huerfana en la cola para siempre.
//
// EN TODO, no en verde ni borrado (2026-07-16): el bug es REAL y esta medido, pero taparlo
// exige una decision de negocio que es de Sebastián, no de la IA. Cuando el auto-archivo se
// lleva una campana con bloqueadas vivas, o (a) se cierran con motivo_fin -- abandono
// explicito, salen de la cola y se pierde la señal de "esta empresa nunca pudo entrar por
// falta de email" --, o (b) la campana no se auto-archiva mientras haya revision pendiente,
// contradiciendo la decision del 2026-07-10 ("una cuenta atascada no debe dejar la campana
// activa para siempre"). Un test rojo en main rompe la suite de todos; borrarlo perderia el
// hallazgo. todo() lo deja documentado y ejecutandose sin tumbar el build.
test('el auto-archivo del worker no deja bloqueadas huerfanas en la cola', { todo: 'falta decision de Sebastián: cerrar las bloqueadas al auto-archivar, o no auto-archivar si hay revision pendiente' }, () => {
  const idCampana = crearCampana({ nombre: 'AutoArchivada', idCadencia, idSegmento: segZombi3 }, 1);
  inscribirCampana(idCampana, 1);
  assert.equal(historialInscripciones('e-zombi3').filter((i) => i.estado === 'bloqueada').length, 1, 'precondicion: nace bloqueada');

  const archivadas = archivarCampanasCompletadas();
  assert.ok(
    archivadas.some((c) => c.idCampana === idCampana),
    'precondicion: la campana se auto-archiva (sus activas estan agotadas: no tiene ninguna)',
  );
  assert.equal(estadoCampana(idCampana), 'archivada');

  const enCola = inscripcionesBloqueadas().filter((b) => b.idCampana === idCampana);
  assert.equal(enCola.length, 0, 'la cola no debe ofrecer trabajo de una campana auto-archivada');
});
