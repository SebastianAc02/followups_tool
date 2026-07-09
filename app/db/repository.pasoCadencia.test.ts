// Fase 4 (cockpit de cadencia): mutators sueltos sobre paso_cadencia que faltaban.
// crearCadencia solo inserta al crear; aca se cubre actualizar un paso existente
// (dia/canal/es_manual) y agregar un paso nuevo a una cadencia ya creada, ambos
// bloqueando la UI de app/cadencias/[id]/CadenciaCockpit.tsx. DB temporal, mismo
// patron que repository.agenda.test.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, actualizarPasoCadencia, agregarPasoCadencia, eliminarPasoCadencia, getCadencia } = await import('./repository.ts');

const idCadencia = crearCadencia({
  nombre: 'C',
  pasos: [
    { orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'a' },
    { orden: 2, diaOffset: 3, canal: 'whatsapp', cuerpo: 'b', esManual: true },
  ],
});

function idPasoOrden(orden: number, deCadencia = idCadencia) {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ? AND orden = ?').get(deCadencia, orden) as
    | { id_paso: number }
    | undefined;
  raw.close();
  if (!fila) throw new Error(`no encontre el paso orden ${orden}`);
  return fila.id_paso;
}

test('actualizarPasoCadencia actualiza solo los campos presentes', () => {
  const idPaso = idPasoOrden(1);

  actualizarPasoCadencia(idPaso, { diaOffset: 5 });

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT dia_offset, canal, es_manual FROM paso_cadencia WHERE id_paso = ?').get(idPaso) as {
    dia_offset: number;
    canal: string;
    es_manual: number;
  };
  raw.close();

  assert.equal(fila.dia_offset, 5, 'diaOffset se actualizo');
  assert.equal(fila.canal, 'correo', 'canal no se toco (no vino en cambios)');
  assert.equal(fila.es_manual, 0, 'esManual no se toco (no vino en cambios)');
});

test('actualizarPasoCadencia actualiza canal y esManual juntos', () => {
  const idPaso = idPasoOrden(2);

  actualizarPasoCadencia(idPaso, { canal: 'llamada', esManual: true });

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT canal, es_manual, dia_offset FROM paso_cadencia WHERE id_paso = ?').get(idPaso) as {
    canal: string;
    es_manual: number;
    dia_offset: number;
  };
  raw.close();

  assert.equal(fila.canal, 'llamada');
  assert.equal(fila.es_manual, 1);
  assert.equal(fila.dia_offset, 3, 'diaOffset no se toco');
});

test('actualizarPasoCadencia rechaza un canal fuera del enum', () => {
  const idPaso = idPasoOrden(1);
  assert.throws(() => actualizarPasoCadencia(idPaso, { canal: 'fax' as never }));
});

test('agregarPasoCadencia inserta con el siguiente orden correlativo y su version default', () => {
  const idPaso = agregarPasoCadencia(idCadencia, { diaOffset: 7, canal: 'correo', objetivo: 'cierre', asunto: 'Hola', cuerpo: 'Cuerpo nuevo' });

  const raw = new Database(dbPath);
  const paso = raw.prepare('SELECT orden, dia_offset, canal, objetivo, es_manual FROM paso_cadencia WHERE id_paso = ?').get(idPaso) as {
    orden: number;
    dia_offset: number;
    canal: string;
    objetivo: string | null;
    es_manual: number;
  };
  const version = raw
    .prepare('SELECT asunto, cuerpo, es_default, activa, peso FROM version_paso WHERE id_paso = ?')
    .get(idPaso) as { asunto: string | null; cuerpo: string | null; es_default: number; activa: number; peso: number };
  raw.close();

  assert.equal(paso.orden, 3, 'siguiente correlativo tras los 2 pasos existentes');
  assert.equal(paso.dia_offset, 7);
  assert.equal(paso.canal, 'correo');
  assert.equal(paso.objetivo, 'cierre');
  assert.equal(paso.es_manual, 0, 'esManual default false cuando no viene');
  assert.equal(version.asunto, 'Hola');
  assert.equal(version.cuerpo, 'Cuerpo nuevo');
  assert.equal(version.es_default, 1);
  assert.equal(version.activa, 1);
  assert.equal(version.peso, 1);
});

test('agregarPasoCadencia queda visible via getCadencia', () => {
  const antes = getCadencia(idCadencia)!.pasos.length;
  agregarPasoCadencia(idCadencia, { diaOffset: 10, canal: 'whatsapp', esManual: true });
  const despues = getCadencia(idCadencia)!.pasos;
  assert.equal(despues.length, antes + 1);
  assert.equal(despues[despues.length - 1].orden, antes + 1);
});

// Fase 7 (editor de cadencia): objetivo es el unico campo channel-agnostic editable
// despues de creado, y vive en paso_cadencia (no version_paso) porque no se versiona.
test('actualizarPasoCadencia guarda y limpia objetivo', () => {
  const idPaso = idPasoOrden(1);
  actualizarPasoCadencia(idPaso, { objetivo: 'Agendar 15 min' });
  assert.equal(getCadencia(idCadencia)!.pasos.find((p) => p.idPaso === idPaso)!.objetivo, 'Agendar 15 min');

  actualizarPasoCadencia(idPaso, { objetivo: '   ' });
  assert.equal(getCadencia(idCadencia)!.pasos.find((p) => p.idPaso === idPaso)!.objetivo, null, 'objetivo en blanco se guarda como null');
});

// Fase 7 (editor de cadencia): "Eliminar" en la vista por pasos, con sus dos guardas.
test('eliminarPasoCadencia rechaza si es el unico paso de la cadencia', () => {
  const idCadenciaSolo = crearCadencia({ nombre: 'Solo', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
  const idPaso = idPasoOrden(1, idCadenciaSolo);
  const res = eliminarPasoCadencia(idPaso);
  assert.equal(res.ok, false);
  assert.equal(getCadencia(idCadenciaSolo)!.pasos.length, 1, 'no se borro nada');
});

test('eliminarPasoCadencia borra el paso y sus version_paso si no tiene historia de envio', () => {
  const idPaso = agregarPasoCadencia(idCadencia, { diaOffset: 20, canal: 'whatsapp', cuerpo: 'chau', esManual: true });
  const antes = getCadencia(idCadencia)!.pasos.length;

  const res = eliminarPasoCadencia(idPaso);
  assert.equal(res.ok, true);

  const despues = getCadencia(idCadencia)!.pasos;
  assert.equal(despues.length, antes - 1);
  assert.ok(!despues.some((p) => p.idPaso === idPaso));

  const raw = new Database(dbPath);
  const version = raw.prepare('SELECT count(*) as n FROM version_paso WHERE id_paso = ?').get(idPaso) as { n: number };
  raw.close();
  assert.equal(version.n, 0, 'sus version_paso tambien se borraron');
});

test('eliminarPasoCadencia rechaza un paso que ya tiene historia real de envio', () => {
  const idPaso = agregarPasoCadencia(idCadencia, { diaOffset: 30, canal: 'correo', cuerpo: 'con historia' });
  const raw = new Database(dbPath);
  const version = raw.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(idPaso) as { id_version: number };
  raw.prepare(`INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado) VALUES (1, ?, ?, 'correo', 'enviada')`).run(
    idPaso,
    version.id_version,
  );
  raw.close();

  const res = eliminarPasoCadencia(idPaso);
  assert.equal(res.ok, false);
  assert.ok(getCadencia(idCadencia)!.pasos.some((p) => p.idPaso === idPaso), 'el paso sigue existiendo');
});

// Sesion 2026-07-09 (registro de proveedor por canal): un paso automatico (esManual
// false) solo es valido en un canal con proveedor real -- ver CANALES_AUTOMATICOS en
// db/validation.ts y app/adapters/registro-envio.ts.
test('agregarPasoCadencia rechaza un canal sin proveedor automatico si esManual queda en false', () => {
  assert.throws(() => agregarPasoCadencia(idCadencia, { diaOffset: 40, canal: 'whatsapp' }), /proveedor automático/);
});

test('agregarPasoCadencia acepta whatsapp si esManual es true', () => {
  const idPaso = agregarPasoCadencia(idCadencia, { diaOffset: 41, canal: 'whatsapp', esManual: true });
  assert.ok(getCadencia(idCadencia)!.pasos.some((p) => p.idPaso === idPaso));
});

test('agregarPasoCadencia acepta correo automatico (tiene proveedor)', () => {
  const idPaso = agregarPasoCadencia(idCadencia, { diaOffset: 42, canal: 'correo' });
  assert.ok(getCadencia(idCadencia)!.pasos.some((p) => p.idPaso === idPaso));
});

test('actualizarPasoCadencia rechaza pasar a whatsapp sin marcar esManual (deja el false que ya tenia)', () => {
  const idPaso = agregarPasoCadencia(idCadencia, { diaOffset: 43, canal: 'correo' });
  assert.throws(() => actualizarPasoCadencia(idPaso, { canal: 'whatsapp' }), /proveedor automático/);
});

test('actualizarPasoCadencia rechaza volver automatico (esManual: false) un paso de llamada', () => {
  const idPaso = agregarPasoCadencia(idCadencia, { diaOffset: 44, canal: 'llamada', esManual: true });
  assert.throws(() => actualizarPasoCadencia(idPaso, { esManual: false }), /proveedor automático/);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
