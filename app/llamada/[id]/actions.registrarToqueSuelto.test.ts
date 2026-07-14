import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToque } = await import('../../db/repository.ts');
const { registrarToqueSchema } = await import('../../db/validation.ts');

function seedEmpresa(id: string, idOrganizacion = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', ?)`,
    )
    .run(id, id, id, idOrganizacion);
  raw.close();
}

test('registrarToqueSuelto: proximoFollowUp queda en el toque y en empresa.proximo_follow_up_fecha', () => {
  seedEmpresa('e1');

  // Mismo input que arma registrarToqueSueltoAction(idEmpresa, canal, cuerpo, proximoFollowUp).
  const parsed = registrarToqueSchema.parse({
    idEmpresa: 'e1',
    canal: 'whatsapp',
    resultado: 'no_contesto',
    quePaso: 'Le escribi por WhatsApp, sin respuesta aun',
    proximoFollowUp: '2026-07-21',
  });
  registrarToque(parsed, 1);

  const raw = new Database(dbPath);
  const toqueGuardado = raw.prepare(`SELECT proximo_follow_up_fecha FROM toque WHERE id_empresa = 'e1'`).get() as {
    proximo_follow_up_fecha: string | null;
  };
  const empresaGuardada = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'e1'`).get() as {
    proximo_follow_up_fecha: string | null;
  };
  raw.close();

  assert.equal(toqueGuardado.proximo_follow_up_fecha, '2026-07-21');
  assert.equal(empresaGuardada.proximo_follow_up_fecha, '2026-07-21');
});
