// estadoCadencia (2026-08-03): la lectura que la cola no podia dar. colaDelDia excluye
// 'lead' por regla del operador y esa regla se queda; lo que faltaba era poder MIRAR esos
// leads: su proximo_follow_up_fecha y si tienen una secuencia corriendo.
//
// Lo que estos tests fijan no es el formato, es el UNIVERSO y el corte:
//   - un lead entra (es el caso entero por el que existe la funcion);
//   - una inscripcion PAUSADA sale igual que una activa (distinguir "nunca estuvo" de "la
//     sacaron" es la mitad de la pregunta);
//   - una empresa concreta que no existe es un ERROR, no una lista vacia.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { estadoCadencia } = await import('./repository.ts');

const ORG = 8801;

function seedEmpresa(
  id: string,
  opts: { estado?: string | null; owner?: string | null; fecha?: string | null; canal?: string | null; org?: number; operaBajoId?: string | null } = {},
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, owner, proximo_follow_up_fecha, proximo_canal, organizacion_activa_id, opera_bajo_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      id,
      id,
      opts.estado ?? null,
      opts.owner ?? null,
      opts.fecha ?? null,
      opts.canal ?? null,
      opts.org ?? ORG,
      opts.operaBajoId ?? null,
    );
  raw.close();
}

// Cadencia + campana + inscripcion + destinatario + un paso materializado. Devuelve los ids
// para que cada test asserte sobre la fila concreta y no sobre "la primera".
function seedCadencia(
  idEmpresa: string,
  opts: { estadoInscripcion?: string; estadoPaso?: string; fechaProgramada?: string; fechaFin?: string | null; esManual?: number } = {},
) {
  const raw = new Database(dbPath);
  const cad = raw.prepare(`INSERT INTO cadencia (nombre) VALUES ('Cad ${idEmpresa}')`).run();
  const idCad = Number(cad.lastInsertRowid);
  const paso = raw
    .prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal, es_manual) VALUES (?, 1, 0, 'whatsapp', ?)`)
    .run(idCad, opts.esManual ?? 0);
  const idPaso = Number(paso.lastInsertRowid);
  const version = raw.prepare(`INSERT INTO version_paso (id_paso, cuerpo) VALUES (?, 'hola')`).run(idPaso);
  const seg = raw.prepare(`INSERT INTO segmento (nombre, definicion) VALUES ('Seg ${idEmpresa}', '{}')`).run();
  const camp = raw
    .prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento, estado, id_organizacion) VALUES ('Camp ${idEmpresa}', ?, ?, 'activa', ?)`)
    .run(idCad, Number(seg.lastInsertRowid), ORG);
  const idCampana = Number(camp.lastInsertRowid);
  const cont = raw
    .prepare(`INSERT INTO contacto (id_empresa, nombre, es_principal, telefono, email, fuente) VALUES (?, 'KDM', 1, '3001112233', ?, 'cockpit')`)
    .run(idEmpresa, `kdm@${idEmpresa}.test`);
  const ins = raw
    .prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado, paso_actual, fecha_inscripcion, fecha_fin) VALUES (?, ?, ?, 1, '2026-07-20', ?)`)
    .run(idCampana, idEmpresa, opts.estadoInscripcion ?? 'activa', opts.fechaFin ?? null);
  const idInscripcion = Number(ins.lastInsertRowid);
  const dest = raw
    .prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto, estado) VALUES (?, ?, 'activo')`)
    .run(idInscripcion, Number(cont.lastInsertRowid));
  const pi = raw
    .prepare(
      `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_programada)
       VALUES (?, ?, ?, 'whatsapp', ?, ?)`,
    )
    .run(Number(dest.lastInsertRowid), idPaso, Number(version.lastInsertRowid), opts.estadoPaso ?? 'pendiente', opts.fechaProgramada ?? '2026-08-05');
  raw.close();
  return { idCampana, idInscripcion, idPasoInscripcion: Number(pi.lastInsertRowid) };
}

test.after(() => borrarDbPrueba(dbPath));

// EL CASO. Un lead con fecha, invisible para colaDelDia, tiene que salir aca con su fecha.
test('un lead sale con su proximo_follow_up_fecha: es justo lo que la cola esconde', () => {
  seedEmpresa('ec-lead', { estado: 'lead', owner: 'Sebastian Acosta Molina', fecha: '2026-07-01', canal: 'whatsapp' });
  const r = estadoCadencia({ idEmpresa: 'ec-lead' }, ORG);
  assert.equal(r.total, 1);
  assert.equal(r.cuentas[0].estadoNotion, 'lead');
  assert.equal(r.cuentas[0].proximoFollowUpFecha, '2026-07-01');
  assert.equal(r.cuentas[0].proximoCanal, 'whatsapp');
});

test('un lead sin ninguna inscripcion se reporta como tal, no como lista vacia sin contexto', () => {
  const r = estadoCadencia({ idEmpresa: 'ec-lead' }, ORG);
  assert.deepEqual(r.cuentas[0].inscripciones, []);
  assert.equal(r.cuentas[0].enCadenciaActiva, false);
  assert.equal(r.sinNingunaInscripcion, 1);
});

test('por owner trae todas sus cuentas incluidos los lead, sin tope', () => {
  seedEmpresa('ec-o1', { estado: 'lead', owner: 'Duenio Uno', fecha: '2026-07-02' });
  seedEmpresa('ec-o2', { estado: 'contacto_iniciado', owner: 'Duenio Uno', fecha: '2026-07-03' });
  seedEmpresa('ec-o3', { estado: 'lead', owner: 'Duenio Dos' });
  const r = estadoCadencia({ owner: 'Duenio Uno' }, ORG);
  assert.deepEqual(
    r.cuentas.map((c) => c.idEmpresa).sort(),
    ['ec-o1', 'ec-o2'],
  );
});

test('el filtro de estado acota a los lead de ese owner', () => {
  const r = estadoCadencia({ owner: 'Duenio Uno', estado: 'lead' }, ORG);
  assert.deepEqual(r.cuentas.map((c) => c.idEmpresa), ['ec-o1']);
});

test('devuelve la inscripcion ACTIVA con su campana, su paso y la fecha programada del paso', () => {
  seedEmpresa('ec-act', { estado: 'lead', owner: 'Duenio Tres', fecha: '2026-07-05' });
  const ids = seedCadencia('ec-act', { fechaProgramada: '2026-08-07' });

  const c = estadoCadencia({ idEmpresa: 'ec-act' }, ORG).cuentas[0];
  assert.equal(c.enCadenciaActiva, true);
  assert.equal(c.inscripciones.length, 1);
  const i = c.inscripciones[0];
  assert.equal(i.idInscripcion, ids.idInscripcion);
  assert.equal(i.idCampana, ids.idCampana);
  assert.equal(i.campana, 'Camp ec-act');
  assert.equal(i.estadoCampana, 'activa');
  assert.equal(i.estado, 'activa');
  assert.equal(i.viva, true);
  assert.equal(i.pasoActual, 1);
  assert.equal(i.proximoPaso?.idPasoInscripcion, ids.idPasoInscripcion);
  assert.equal(i.proximoPaso?.fechaProgramada, '2026-08-07');
  assert.equal(i.proximoPaso?.canal, 'whatsapp');
});

// Distinguir "nunca estuvo en cadencia" de "la sacaron el martes" es la mitad de la
// pregunta. leerCadenciasVivas (lo unico parecido que habia) filtra por fecha_fin y por eso
// no podia responderla.
test('devuelve tambien las inscripciones PAUSADAS, con su motivo y su origen de fin', () => {
  seedEmpresa('ec-pau', { estado: 'lead', owner: 'Duenio Tres' });
  seedCadencia('ec-pau', { estadoInscripcion: 'pausada', fechaFin: '2026-07-30T12:00:00.000Z', estadoPaso: 'enviada' });
  const raw = new Database(dbPath);
  raw.prepare(`UPDATE inscripcion SET motivo_fin = 'respuesta detectada (whatsapp)', origen_fin = 'respuesta' WHERE id_empresa = 'ec-pau'`).run();
  raw.close();

  const c = estadoCadencia({ idEmpresa: 'ec-pau' }, ORG).cuentas[0];
  assert.equal(c.enCadenciaActiva, false);
  assert.equal(c.inscripciones.length, 1);
  assert.equal(c.inscripciones[0].estado, 'pausada');
  assert.equal(c.inscripciones[0].viva, false);
  assert.equal(c.inscripciones[0].origenFin, 'respuesta');
  assert.match(c.inscripciones[0].motivoFin ?? '', /respuesta detectada/);
});

test('proximoPaso es null cuando ya no queda ningun paso que pueda salir', () => {
  const c = estadoCadencia({ idEmpresa: 'ec-pau' }, ORG).cuentas[0];
  assert.equal(c.inscripciones[0].pasos.length, 1);
  assert.equal(c.inscripciones[0].pasos[0].estado, 'enviada');
  assert.equal(c.inscripciones[0].proximoPaso, null);
});

// El gate de WhatsApp: un paso sin aprobado_en NO sale por mas que su fecha llegue. Sin este
// campo en la lectura, "programado para el 5" se lee como "sale el 5" y no es cierto.
test('el paso trae es_manual y aprobado_en, que son los que deciden si de verdad sale', () => {
  seedEmpresa('ec-man', { estado: 'lead' });
  seedCadencia('ec-man', { esManual: 1 });
  const p = estadoCadencia({ idEmpresa: 'ec-man' }, ORG).cuentas[0].inscripciones[0].proximoPaso;
  assert.equal(p?.esManual, true);
  assert.equal(p?.aprobadoEn, null);
});

test('no mezcla organizaciones', () => {
  seedEmpresa('ec-otra', { estado: 'lead', owner: 'Duenio Uno', org: 9999 });
  const r = estadoCadencia({ owner: 'Duenio Uno' }, ORG);
  assert.equal(r.cuentas.find((c) => c.idEmpresa === 'ec-otra'), undefined);
});

test('deja fuera las identidades absorbidas por una fusion de duplicados', () => {
  seedEmpresa('ec-viva', { estado: 'lead', owner: 'Duenio Fusion' });
  seedEmpresa('ec-muerta', { estado: 'lead', owner: 'Duenio Fusion', operaBajoId: 'ec-viva' });
  const r = estadoCadencia({ owner: 'Duenio Fusion' }, ORG);
  assert.deepEqual(r.cuentas.map((c) => c.idEmpresa), ['ec-viva']);
});

// "no tiene cadencia" y "no esta en la base" son diagnosticos distintos: responder lo mismo a
// los dos manda a inscribir una cuenta que no existe.
test('pedir una empresa concreta que no existe LANZA, no devuelve lista vacia', () => {
  assert.throws(() => estadoCadencia({ idEmpresa: 'ec-no-existe' }, ORG), /no existe en la organizacion/);
});

test('pedir una empresa de otra organizacion LANZA igual que una inexistente: no se filtra en silencio', () => {
  assert.throws(() => estadoCadencia({ idEmpresa: 'ec-otra' }, ORG), /no existe en la organizacion/);
});

test('sin ningun filtro LANZA: un volcado de la organizacion entera no es una pregunta', () => {
  assert.throws(() => estadoCadencia({} as any, ORG), /al menos idEmpresa, owner o estado/);
});

test('un owner sin cuentas devuelve lista vacia, que aca SI es la respuesta correcta', () => {
  const r = estadoCadencia({ owner: 'Nadie Aqui' }, ORG);
  assert.equal(r.total, 0);
  assert.deepEqual(r.cuentas, []);
});
