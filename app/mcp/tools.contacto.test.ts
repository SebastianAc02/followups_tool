// crear_contacto y actualizar_contacto (2026-07-28): el movimiento que le faltaba al MCP para
// tener a quien mandarle una cadencia. Lo que este archivo fija:
//
//   - se escribe la fila de verdad y lo que se devuelve sale de RELEER la base, no del input.
//     Cada assert cruza el valor de retorno contra una conexion better-sqlite3 abierta aparte:
//     un mock que devuelva el eco del input no pasa estos tests.
//   - el antidupe corre ANTES de insertar, por email exacto y por los ultimos 10 digitos del
//     telefono, y NO escribe nada cuando dispara. Un contacto duplicado significa que la misma
//     persona recibe la cadencia dos veces.
//   - es_principal es exclusivo: marcar uno degrada al anterior en la MISMA transaccion, y eso
//     se comprueba contando filas con es_principal=1 en la base, no leyendo el resultado.
//   - una empresa de otra organizacion, o inexistente, falla ANTES de escribir.
//   - el contacto queda en un estado que inscribirEmpresaEnCadencia entiende: se corre la
//     inscripcion de verdad y se verifica que la fila `destinatario` apunta a este contacto.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearContactoTool, actualizarContactoTool } = await import('./tools.ts');
const { TOOLS_ESCRITURA, TOOLS_LECTURA } = await import('./server.ts');
const { inscribirEmpresaEnCadencia, contactosDeEmpresa } = await import('../db/repository.ts');

const ORG = 1;
const OTRA_ORG = 77;

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, idOrganizacion = ORG) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'activo', 'lead', ?, 'Sebastian Acosta Molina')`,
  ).run(id, id, id, idOrganizacion);
  db.close();
}

// Lee la fila cruda. Es el unico juez: si la tool devolviera algo que la base no tiene, esto lo
// delata.
function filaContacto(idContacto: number) {
  const db = raw();
  const f = db.prepare('SELECT * FROM contacto WHERE id_contacto = ?').get(idContacto) as
    | Record<string, unknown>
    | undefined;
  db.close();
  return f;
}

function contarContactos(idEmpresa: string): number {
  const db = raw();
  const { c } = db.prepare('SELECT count(*) c FROM contacto WHERE id_empresa = ?').get(idEmpresa) as { c: number };
  db.close();
  return c;
}

test('crear_contacto escribe la fila y devuelve lo que quedo EN LA BASE, no el eco del input', () => {
  seedEmpresa('ct-1');
  const r = crearContactoTool(
    { idEmpresa: 'ct-1', nombre: 'Ana', apellido: 'Pérez', cargo: 'Gerente General', email: 'ana@ct1.co', telefono: '+57 300 123 4567' },
    ORG,
  );
  assert.equal(r.creado, true);
  if (!r.creado) return;

  const fila = filaContacto(r.contacto.idContacto);
  assert.ok(fila, 'la fila tiene que existir en la base');
  assert.equal(fila!.id_empresa, 'ct-1');
  assert.equal(fila!.nombre, 'Ana');
  assert.equal(fila!.email, 'ana@ct1.co');
  assert.equal(fila!.telefono, '+57 300 123 4567');
  // La categoria NO la manda el cliente: se deriva del cargo con clasificarCargo. Que quede
  // 'gerente' prueba que se derivo y no que se copio el texto libre.
  assert.equal(fila!.cargo_categoria, 'gerente');
  assert.equal(fila!.fuente, 'mcp');
  assert.equal(fila!.es_principal, 0);
  assert.equal(fila!.es_key_decision_maker, 0);

  // Y lo devuelto coincide con lo escrito.
  assert.equal(r.contacto.cargoCategoria, 'gerente');
  assert.equal(r.contacto.esPrincipal, false);
  assert.equal(r.contactosEmpresa.length, 1);
});

test('crear_contacto: el email es lo que le da destinatario a la empresa, y se dice quien seria', () => {
  seedEmpresa('ct-2');
  const r = crearContactoTool({ idEmpresa: 'ct-2', nombre: 'Beto', email: 'beto@ct2.co' }, ORG);
  assert.equal(r.creado, true);
  if (!r.creado) return;
  assert.equal(r.destinatarioDeLaCadencia?.idContacto, r.contacto.idContacto);
  assert.equal(r.destinatarioDeLaCadencia?.email, 'beto@ct2.co');
  assert.equal(r.advertencias.length, 0);
});

test('crear_contacto sin email avisa que la empresa SIGUE sin destinatario', () => {
  seedEmpresa('ct-3');
  const r = crearContactoTool({ idEmpresa: 'ct-3', nombre: 'Caro', telefono: '3009998877' }, ORG);
  assert.equal(r.creado, true);
  if (!r.creado) return;
  assert.equal(r.destinatarioDeLaCadencia, null);
  assert.ok(r.advertencias.some((a) => a.includes('SIN destinatario')), r.advertencias.join(' | '));
});

test('crear_contacto exige email o telefono: sin ninguno de los dos es error de entrada, no una fila inutil', () => {
  seedEmpresa('ct-4');
  assert.throws(() => crearContactoTool({ idEmpresa: 'ct-4', nombre: 'Sin datos' }, ORG), /email o telefono/i);
  assert.equal(contarContactos('ct-4'), 0);
});

test('crear_contacto rechaza un email invalido antes de tocar la base', () => {
  seedEmpresa('ct-5');
  assert.throws(() => crearContactoTool({ idEmpresa: 'ct-5', email: 'no-es-un-email' }, ORG), /email/i);
  assert.equal(contarContactos('ct-5'), 0);
});

test('crear_contacto sobre una empresa que no existe falla explicito y no escribe', () => {
  assert.throws(() => crearContactoTool({ idEmpresa: 'ct-no-existe', email: 'x@y.co' }, ORG), /no existe/i);
  assert.equal(contarContactos('ct-no-existe'), 0);
});

test('crear_contacto sobre una empresa de OTRA organizacion falla y no escribe', () => {
  seedEmpresa('ct-6', OTRA_ORG);
  assert.throws(() => crearContactoTool({ idEmpresa: 'ct-6', email: 'x@ct6.co' }, ORG), /otra organizacion/i);
  assert.equal(contarContactos('ct-6'), 0);
});

test('antidupe por email: no crea la segunda fila y devuelve el idContacto de la que ya estaba', () => {
  seedEmpresa('ct-7');
  const primero = crearContactoTool({ idEmpresa: 'ct-7', nombre: 'Dana', email: 'Dana@ct7.co' }, ORG);
  assert.equal(primero.creado, true);
  if (!primero.creado) return;

  // Mayusculas y espacios distintos: es la misma persona.
  const segundo = crearContactoTool({ idEmpresa: 'ct-7', nombre: 'Dana Otra vez', email: '  dana@CT7.co  ' }, ORG);
  assert.equal(segundo.creado, false);
  if (segundo.creado) return;
  assert.equal(segundo.motivo, 'duplicado_probable');
  assert.equal(segundo.candidatos.length, 1);
  assert.equal(segundo.candidatos[0].idContacto, primero.contacto.idContacto);
  // Lo que importa: la base sigue con UNA fila.
  assert.equal(contarContactos('ct-7'), 1);
});

test('antidupe por telefono: compara los ultimos 10 digitos, asi +57 y los separadores no engañan', () => {
  seedEmpresa('ct-8');
  const primero = crearContactoTool({ idEmpresa: 'ct-8', nombre: 'Elena', telefono: '+57 301 555 4433' }, ORG);
  assert.equal(primero.creado, true);
  if (!primero.creado) return;

  const segundo = crearContactoTool({ idEmpresa: 'ct-8', nombre: 'Elena', telefono: '3015554433', email: 'elena@ct8.co' }, ORG);
  assert.equal(segundo.creado, false);
  if (segundo.creado) return;
  assert.equal(segundo.candidatos[0].idContacto, primero.contacto.idContacto);
  assert.equal(contarContactos('ct-8'), 1);
});

test('el antidupe es POR EMPRESA: el mismo telefono en otra cuenta si se crea', () => {
  seedEmpresa('ct-9a');
  seedEmpresa('ct-9b');
  crearContactoTool({ idEmpresa: 'ct-9a', nombre: 'Fabio', telefono: '3011112222' }, ORG);
  const otro = crearContactoTool({ idEmpresa: 'ct-9b', nombre: 'Fabio', telefono: '3011112222' }, ORG);
  assert.equal(otro.creado, true);
  assert.equal(contarContactos('ct-9b'), 1);
});

test('forzar:true salta el antidupe y crea la segunda fila', () => {
  seedEmpresa('ct-10');
  crearContactoTool({ idEmpresa: 'ct-10', nombre: 'Gina', email: 'gina@ct10.co' }, ORG);
  const forzado = crearContactoTool({ idEmpresa: 'ct-10', nombre: 'Gina hermana', email: 'gina@ct10.co', forzar: true }, ORG);
  assert.equal(forzado.creado, true);
  assert.equal(contarContactos('ct-10'), 2);
});

test('es_principal es EXCLUSIVO: marcar uno degrada al anterior en la misma transaccion', () => {
  seedEmpresa('ct-11');
  const uno = crearContactoTool({ idEmpresa: 'ct-11', nombre: 'Hugo', email: 'hugo@ct11.co', esPrincipal: true }, ORG);
  assert.equal(uno.creado, true);
  if (!uno.creado) return;

  const dos = crearContactoTool({ idEmpresa: 'ct-11', nombre: 'Iris', email: 'iris@ct11.co', esPrincipal: true }, ORG);
  assert.equal(dos.creado, true);
  if (!dos.creado) return;
  assert.equal(dos.principalAnterior?.idContacto, uno.contacto.idContacto);

  // Se comprueba EN LA BASE, no en el valor de retorno: exactamente una fila con es_principal=1.
  const db = raw();
  const principales = db.prepare('SELECT id_contacto FROM contacto WHERE id_empresa = ? AND es_principal = 1').all('ct-11') as {
    id_contacto: number;
  }[];
  db.close();
  assert.equal(principales.length, 1);
  assert.equal(principales[0].id_contacto, dos.contacto.idContacto);
  assert.ok(dos.advertencias.some((a) => a.includes('dejó de ser el principal')), dos.advertencias.join(' | '));
});

test('el KDM le gana al principal al resolver destinatario, y la tool lo avisa en vez de dejar que se descubra con el correo mandado', () => {
  seedEmpresa('ct-12');
  const kdm = crearContactoTool({ idEmpresa: 'ct-12', nombre: 'Jefe', email: 'jefe@ct12.co', esKdm: true }, ORG);
  assert.equal(kdm.creado, true);
  if (!kdm.creado) return;

  const principal = crearContactoTool({ idEmpresa: 'ct-12', nombre: 'Karla', email: 'karla@ct12.co', esPrincipal: true }, ORG);
  assert.equal(principal.creado, true);
  if (!principal.creado) return;

  assert.equal(principal.destinatarioDeLaCadencia?.idContacto, kdm.contacto.idContacto);
  assert.ok(
    principal.advertencias.some((a) => a.includes('NO le va a llegar')),
    principal.advertencias.join(' | '),
  );
});

test('actualizar_contacto le pone el email al contacto que registrar_toque dejo sin uno, y eso desbloquea el destinatario', () => {
  seedEmpresa('ct-13');
  // Asi queda un contacto creado por el campo kdm de registrar_toque: nombre y telefono, sin email.
  const db = raw();
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, fuente)
     VALUES ('ct-13', 'Luis', 1, 0, '3021234567', 'cockpit')`,
  ).run();
  const idContacto = (db.prepare('SELECT id_contacto FROM contacto WHERE id_empresa = ?').get('ct-13') as { id_contacto: number }).id_contacto;
  db.close();

  const r = actualizarContactoTool({ idContacto, email: 'luis@ct13.co', cargo: 'Subgerente Comercial' }, ORG);
  assert.equal(r.actualizado, true);
  if (!r.actualizado) return;

  const fila = filaContacto(idContacto)!;
  assert.equal(fila.email, 'luis@ct13.co');
  assert.equal(fila.cargo, 'Subgerente Comercial');
  // 'subgerente' antes que 'comercial': se derivo con clasificarCargo, no a mano.
  assert.equal(fila.cargo_categoria, 'subgerente');
  // Lo que NO vino no se toco.
  assert.equal(fila.nombre, 'Luis');
  assert.equal(fila.telefono, '3021234567');
  assert.equal(r.destinatarioDeLaCadencia?.idContacto, idContacto);
});

test('actualizar_contacto exige al menos un campo, y un contacto inexistente falla explicito', () => {
  assert.throws(() => actualizarContactoTool({ idContacto: 999999 }, ORG), /al menos un campo/i);
  assert.throws(() => actualizarContactoTool({ idContacto: 999999, email: 'x@y.co' }, ORG), /no existe/i);
});

test('actualizar_contacto no deja fabricar el duplicado por la puerta de atras: el email de otro contacto de la empresa se rechaza', () => {
  seedEmpresa('ct-14');
  const uno = crearContactoTool({ idEmpresa: 'ct-14', nombre: 'Mara', email: 'mara@ct14.co' }, ORG);
  const dos = crearContactoTool({ idEmpresa: 'ct-14', nombre: 'Nico', email: 'nico@ct14.co' }, ORG);
  assert.equal(uno.creado && dos.creado, true);
  if (!uno.creado || !dos.creado) return;

  const r = actualizarContactoTool({ idContacto: dos.contacto.idContacto, email: 'mara@ct14.co' }, ORG);
  assert.equal(r.actualizado, false);
  if (r.actualizado) return;
  assert.equal(r.candidatos[0].idContacto, uno.contacto.idContacto);
  // Y la base quedo intacta.
  assert.equal(filaContacto(dos.contacto.idContacto)!.email, 'nico@ct14.co');
});

test('actualizar_contacto con su PROPIO email no se considera duplicado de si mismo', () => {
  seedEmpresa('ct-15');
  const uno = crearContactoTool({ idEmpresa: 'ct-15', nombre: 'Olga', email: 'olga@ct15.co' }, ORG);
  assert.equal(uno.creado, true);
  if (!uno.creado) return;
  const r = actualizarContactoTool({ idContacto: uno.contacto.idContacto, email: 'olga@ct15.co', nombre: 'Olga R.' }, ORG);
  assert.equal(r.actualizado, true);
  assert.equal(filaContacto(uno.contacto.idContacto)!.nombre, 'Olga R.');
});

test('actualizar_contacto sobre un contacto de otra organizacion falla y no escribe', () => {
  seedEmpresa('ct-16', OTRA_ORG);
  const db = raw();
  db.prepare(`INSERT INTO contacto (id_empresa, nombre, telefono, fuente) VALUES ('ct-16', 'Ajeno', '3000000000', 'seed')`).run();
  const idContacto = (db.prepare('SELECT id_contacto FROM contacto WHERE id_empresa = ?').get('ct-16') as { id_contacto: number }).id_contacto;
  db.close();

  assert.throws(() => actualizarContactoTool({ idContacto, email: 'ajeno@ct16.co' }, ORG), /otra organizacion/i);
  assert.equal(filaContacto(idContacto)!.email, null);
});

test('el contacto queda en un estado que inscribirEmpresaEnCadencia entiende: la inscripcion nace activa y el destinatario apunta a el', () => {
  seedEmpresa('ct-17');
  const db = raw();
  db.prepare(`INSERT INTO cadencia (id_cadencia, nombre, activa) VALUES (901, 'cad-ct', 1)`).run();
  db.prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal) VALUES (901, 1, 0, 'correo')`).run();
  db.prepare(`INSERT INTO segmento (id_segmento, nombre, definicion) VALUES (901, 'seg-ct', '{"condiciones":[]}')`).run();
  db.prepare(
    `INSERT INTO campana (id_campana, nombre, id_cadencia, id_segmento, estado, modo, regla_faltante) VALUES (901, 'camp-ct', 901, 901, 'borrador', 'batch', 'cola')`,
  ).run();
  db.close();

  // Antes de cargar el contacto la empresa no tiene a quien mandarle nada.
  assert.equal(contactosDeEmpresa('ct-17').length, 0);

  const creado = crearContactoTool({ idEmpresa: 'ct-17', nombre: 'Pedro', email: 'pedro@ct17.co', esKdm: true }, ORG);
  assert.equal(creado.creado, true);
  if (!creado.creado) return;

  const ins = inscribirEmpresaEnCadencia('ct-17', 901);
  assert.equal(ins.ok, true);
  if (!ins.ok) return;
  // 'activa' y no 'bloqueada' es exactamente lo que el contacto con email desbloquea.
  assert.equal(ins.estado, 'activa');

  const db2 = raw();
  const dest = db2.prepare('SELECT id_contacto FROM destinatario WHERE id_inscripcion = ?').get(ins.idInscripcion) as
    | { id_contacto: number }
    | undefined;
  db2.close();
  assert.equal(dest?.id_contacto, creado.contacto.idContacto);
});

test('las dos tools estan declaradas como ESCRITURA, no como lectura', () => {
  assert.ok((TOOLS_ESCRITURA as readonly string[]).includes('crear_contacto'));
  assert.ok((TOOLS_ESCRITURA as readonly string[]).includes('actualizar_contacto'));
  assert.ok(!(TOOLS_LECTURA as readonly string[]).includes('crear_contacto'));
  assert.ok(!(TOOLS_LECTURA as readonly string[]).includes('actualizar_contacto'));
});
