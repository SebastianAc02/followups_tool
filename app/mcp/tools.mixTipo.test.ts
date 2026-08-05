// El mix por tipo de toque en `actividad` (propuesta de tandas, 2026-08-04). Es el bloque del
// tablero del CRO que hoy sale contaminado: se venia derivando de la etapa de la cuenta, y la
// etapa la mueve el toque mismo.
//
// Lo que fija este archivo es la regla dura de la propuesta: la ausencia de dato NUNCA se lee
// como dato. Un mix calculado sobre los 30 toques que traen tipo y presentado como si fueran los
// 96 del periodo es falso de la misma forma en que lo seria un promedio de duracion sobre las
// filas que la traen, y por eso lleva la misma forma que el bloque de duracion: el conteo de los
// que lo dicen, y aparte, en su propia llave, cuantos se quedaron callados.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actividadTool } = await import('./tools.ts');

test.after(() => borrarDbPrueba(dbPath));

function seedEmpresa(id: string, idOrganizacion: number) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', ?)`,
    )
    .run(id, `Empresa ${id}`, id, idOrganizacion);
  raw.close();
}

function seedToque(
  idEmpresa: string,
  fecha: string,
  idOrganizacion: number,
  opts: { tipoToque?: string | null; canal?: string; fuente?: string } = {},
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO toque (id_empresa, fecha, fecha_dia, canal, tipo_toque, resultado, fuente, id_organizacion)
       VALUES (?, ?, ?, ?, ?, 'contesto_sigue_seguimiento', ?, ?)`,
    )
    .run(idEmpresa, fecha, fecha, opts.canal ?? 'llamada', opts.tipoToque ?? null, opts.fuente ?? 'herramienta', idOrganizacion);
  raw.close();
}

test('el mix cuenta los tipos dichos y deja los mudos en su propia llave, nunca repartidos', () => {
  const org = 9101;
  seedEmpresa('mix-1', org);
  seedToque('mix-1', '2026-08-01', org, { tipoToque: 'frio' });
  seedToque('mix-1', '2026-08-01', org, { tipoToque: 'frio' });
  seedToque('mix-1', '2026-08-01', org, { tipoToque: 'cierre' });
  seedToque('mix-1', '2026-08-01', org); // sin tipo: nadie lo dijo
  seedToque('mix-1', '2026-08-01', org); // sin tipo

  const r = actividadTool({ desde: '2026-08-01', hasta: '2026-08-01', idOrganizacion: org });

  assert.deepEqual(r.conteos.tipo.porTipo, { frio: 2, cierre: 1 });
  assert.equal(r.conteos.tipo.toquesConTipo, 3);
  assert.equal(r.conteos.tipo.toquesSinTipo, 2);
  assert.equal(r.totalToques, 5, 'los mudos siguen contando como toques: lo que falta es el tipo, no el toque');
});

// El caso que hace util la llave separada. Sobre estos datos, "el 100% de los toques fueron
// frios" es la lectura equivocada y sale sola si el mix viaja sin su denominador al lado.
test('un solo tipo dicho sobre nueve toques no se puede leer como el 100% del periodo', () => {
  const org = 9102;
  seedEmpresa('mix-2', org);
  seedToque('mix-2', '2026-08-02', org, { tipoToque: 'frio' });
  for (let i = 0; i < 8; i++) seedToque('mix-2', '2026-08-02', org);

  const r = actividadTool({ desde: '2026-08-02', hasta: '2026-08-02', idOrganizacion: org });

  assert.deepEqual(r.conteos.tipo.porTipo, { frio: 1 });
  assert.equal(r.conteos.tipo.toquesConTipo, 1);
  assert.equal(r.conteos.tipo.toquesSinTipo, 8);
});

// Mismo criterio que el resto de `conteos`: los mensajes ENTRANTES de WhatsApp no son trabajo
// del operador y no entran en ningun conteo. Si entraran, un hilo de 42 mensajes se leeria como
// 42 toques sin tipo y hundiria el mix de un dia real.
test('los mensajes entrantes de WhatsApp no engordan el conteo de mudos', () => {
  const org = 9103;
  seedEmpresa('mix-3', org);
  seedToque('mix-3', '2026-08-03', org, { tipoToque: 'seguimiento' });
  seedToque('mix-3', '2026-08-03', org, { canal: 'whatsapp', fuente: 'whatsapp_entrante' });
  seedToque('mix-3', '2026-08-03', org, { canal: 'whatsapp', fuente: 'whatsapp_entrante' });

  const r = actividadTool({ desde: '2026-08-03', hasta: '2026-08-03', idOrganizacion: org });

  assert.deepEqual(r.conteos.tipo.porTipo, { seguimiento: 1 });
  assert.equal(r.conteos.tipo.toquesSinTipo, 0, 'los entrantes no son toques mudos, no son toques');
  assert.equal(r.toquesEntrantes, 2);
});
