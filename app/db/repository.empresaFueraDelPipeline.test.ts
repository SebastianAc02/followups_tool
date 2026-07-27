// empresaFueraDelPipeline.tieneToques: 2026-07-27, mismo criterio que el resto de contadores
// de actividad -- un toque fuente='whatsapp_entrante' no es trabajo real, y no deberia hacer
// que una empresa se lea como "tiene toques" (la explicacion de por que el embudo la excluye).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

// toque.fuente es NOT NULL en el schema real (drizzle/0000_baseline_2026_07_14.sql,
// replicado en test-helpers.ts) y hoy produccion tiene 0 filas en NULL -- por eso el bug de
// `ne()` de mas abajo no muerde todavia. Pero es exactamente el tipo de invariante silenciosa
// que este mismo fix esta corrigiendo en otro lado (ver contadoresHoy/enRango), y un futuro
// escritor que inserte con SQL crudo sin pasar por Drizzle podria dejar fuente en NULL sin
// que nada lo impida a nivel de aplicacion. Se relaja el constraint SOLO en esta DB de
// prueba (recrear la tabla, no un ALTER: SQLite no tiene ALTER COLUMN) para poder sembrar esa
// fila y probar que la condicion `isNull(fuente) OR fuente != 'whatsapp_entrante'` la cuenta
// como toque real, que es el comportamiento correcto sin importar si el constraint blinda a
// produccion hoy.
function permitirFuenteNullEnToque() {
  const raw = new Database(dbPath);
  raw.exec(`
    DROP TABLE toque;
    CREATE TABLE toque (
      id_toque INTEGER PRIMARY KEY AUTOINCREMENT,
      id_empresa TEXT NOT NULL,
      fecha TEXT,
      canal TEXT,
      resultado TEXT,
      fuente TEXT,
      id_organizacion INTEGER NOT NULL DEFAULT 1
    );
  `);
  raw.close();
}
permitirFuenteNullEnToque();

const { empresaFueraDelPipeline } = await import('./repository.ts');

const ORG = 6601;

function seedEmpresa(id: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'lead', 'lead', ?)`,
    )
    .run(id, `EMPRESA ${id}`, id, ORG);
  raw.close();
}

function seedToque(idEmpresa: string, fuente: string | null) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO toque (id_empresa, fecha, fuente, id_organizacion) VALUES (?, '2026-07-27', ?, ?)`).run(idEmpresa, fuente, ORG);
  raw.close();
}

test.after(() => borrarDbPrueba(dbPath));

test('tieneToques es false cuando el unico toque es whatsapp_entrante', () => {
  seedEmpresa('efp-1');
  seedToque('efp-1', 'whatsapp_entrante');

  const r = empresaFueraDelPipeline('efp-1', ORG);
  assert.ok(r);
  assert.equal(r!.tieneToques, false, 'un reply del ISP no es trabajo real del equipo');
});

test('tieneToques es true cuando hay al menos un toque ejecutado', () => {
  seedEmpresa('efp-2');
  seedToque('efp-2', 'whatsapp_entrante');
  seedToque('efp-2', 'cockpit');

  const r = empresaFueraDelPipeline('efp-2', ORG);
  assert.ok(r);
  assert.equal(r!.tieneToques, true);
});

// Encontrado en revision (2026-07-27): la condicion habia quedado como `ne(toque.fuente,
// 'whatsapp_entrante')` a secas. En SQL, `fuente != 'whatsapp_entrante'` evalua a NULL (no a
// true) cuando fuente es NULL, y una fila NULL no pasa un WHERE -- una fila real quedaria
// excluida del conteo. Este test falla contra esa version (tieneToques daria false) y pasa
// con `or(isNull(toque.fuente), ne(...))`, el mismo patron que ya usaba enRango.
test('tieneToques es true con una fila de fuente NULL (constraint real de prod no la permite, pero el filtro no debe depender de eso)', () => {
  seedEmpresa('efp-3');
  seedToque('efp-3', null);

  const r = empresaFueraDelPipeline('efp-3', ORG);
  assert.ok(r);
  assert.equal(r!.tieneToques, true, 'una fila con fuente NULL es un toque real y debe contar');
});
