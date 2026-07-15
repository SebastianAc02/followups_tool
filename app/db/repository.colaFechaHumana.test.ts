// A (2026-07-15): proximo_follow_up_fecha guarda fechas en formato humano ('July 14,
// 2026') junto a ISO ('2026-07-15'). colaDelDia compara con lte() en SQLite, que es
// comparacion de TEXTO: 'July 14, 2026' > '2026-07-15' en ASCII ('J' > '2'), asi que una
// fecha vencida en formato humano JAMAS entra a la cola. Falla en silencio.
//
// Decision (Task A1): normalizar el DATO (scripts/normalizar-follow-up-fecha.ts, mismo
// parser de fecha-toque.ts) Y el BORDE (el adaptador de Notion no vuelve a escribir
// formato humano). colaDelDia mismo NO cambia: sigue comparando texto, a proposito -- una
// vez el dato es ISO en todas partes, lte() vuelve a ser correcto sin ensenarle 6 formatos
// a cada query de la cola. Por eso este test prueba las dos puntas: que el bug es real
// contra dato sucio, y que normalizar (lo que hace el script) lo resuelve sin tocar
// colaDelDia.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';
import { normalizarFechaToque } from '../core/fecha-toque.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaDelDia } = await import('./repository.ts');

const OWNER = 'Felipe Castro';

function seedEmpresa(id: string, estadoNotion: string, proximoFollowUpFecha: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, 1)`,
    )
    .run(id, id, id, OWNER, estadoNotion, proximoFollowUpFecha);
  raw.close();
}

function normalizarFila(id: string, fechaHumana: string) {
  const n = normalizarFechaToque(fechaHumana);
  assert.equal(n.tipo, 'dia', `${fechaHumana} deberia normalizar a un dia`);
  const raw = new Database(dbPath);
  raw.prepare(`UPDATE empresa SET proximo_follow_up_fecha = ? WHERE id_empresa = ?`).run(n.iso, id);
  raw.close();
}

test('colaDelDia: fecha vencida en formato humano de Notion NO sale (el bug), normalizada SI sale (el arreglo)', () => {
  seedEmpresa('humana-vencida', 'contacto_iniciado', 'July 14, 2026');

  const antes = colaDelDia('2026-07-15', OWNER, 1).map((f) => f.id);
  assert.ok(!antes.includes('humana-vencida'), 'con fecha humana sin normalizar, el bug la esconde');

  normalizarFila('humana-vencida', 'July 14, 2026');

  const despues = colaDelDia('2026-07-15', OWNER, 1).map((f) => f.id);
  assert.ok(despues.includes('humana-vencida'), 'normalizada a ISO, colaDelDia si la ve');
});
