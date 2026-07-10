// Tarea C1 (plan-prueba-real-multicanal.md): seed de las 2 empresas + 2 contactos de
// prueba para lanzar las campanas A (correo->whatsapp->llamada) y B
// (whatsapp->correo->llamada). Idempotente: si la empresa ya existe, no la duplica ni
// la actualiza -- correr el script dos veces es seguro.
//
// Guard duro (no solo el comentario): ISPS_DB_PATH es OBLIGATORIO, sin default. Para
// la prueba real apunta a ../isps.db -- HAZ BACKUP ANTES, este script no lo hace.
//
// Correr: ISPS_DB_PATH=/ruta/a/isps.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/seed_prueba_multicanal.ts

import Database from 'better-sqlite3';

const dbPath = process.env.ISPS_DB_PATH;
if (!dbPath) {
  throw new Error('ISPS_DB_PATH es obligatorio (para la prueba real, apunta a ../isps.db -- haz backup antes).');
}

// Onepay, ver scripts/seed_organizacion.ts (la organizacion no tiene ambiguedad hoy:
// es la unica que corre esta prueba).
const ID_ORGANIZACION = 1;

type EmpresaPrueba = {
  id: string;
  nombre: string;
  ciudad: string;
  usuarios: number;
  contacto: { nombre: string; cargo: string; email: string; telefono: string };
};

// Datos confirmados en planning/plan-prueba-real-multicanal.md (2026-07-09).
const EMPRESAS: EmpresaPrueba[] = [
  {
    id: 'prueba-viajes-andinos',
    nombre: 'Viajes Andinos',
    ciudad: 'Bogota',
    usuarios: 1200,
    contacto: { nombre: 'Sebastian', cargo: 'Gerente Comercial', email: 'sacostamolina@outlook.com', telefono: '+12368895214' },
  },
  {
    id: 'prueba-tour-caribe',
    nombre: 'Tour Caribe',
    ciudad: 'Medellin',
    usuarios: 800,
    contacto: { nombre: 'Isabela', cargo: 'Gerente Comercial', email: 'sdacostam@eafit.edu.co', telefono: '+573215924704' },
  },
];

function main() {
  const db = new Database(dbPath);
  try {
    db.exec('BEGIN');
    const ahora = new Date().toISOString();

    for (const e of EMPRESAS) {
      const existe = db.prepare('SELECT id_empresa FROM empresa WHERE id_empresa = ?').get(e.id);
      if (existe) {
        console.log(`Empresa ${e.nombre} (${e.id}) ya existia, se deja igual`);
        continue;
      }

      db.prepare(
        `INSERT INTO empresa (
           id_empresa, tipo_id, nombre_oficial, nombre_normalizado, ciudad_principal,
           estado_comercial, estado_notion, categoria, organizacion_activa_id, created_at, updated_at
         ) VALUES (?, 'nit', ?, ?, ?, 'activo', 'on_hold', 'agencia_viajes', ?, ?, ?)`,
      ).run(e.id, e.nombre, e.nombre.toLowerCase(), e.ciudad, ID_ORGANIZACION, ahora, ahora);

      db.prepare('INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados) VALUES (?, ?)').run(e.id, e.usuarios);

      db.prepare(
        `INSERT INTO contacto (id_empresa, nombre, cargo, email, telefono, es_principal, es_key_decision_maker, fuente)
         VALUES (?, ?, ?, ?, ?, 1, 1, 'seed-prueba-multicanal')`,
      ).run(e.id, e.contacto.nombre, e.contacto.cargo, e.contacto.email, e.contacto.telefono);

      console.log(`Empresa ${e.nombre} (${e.id}) creada con contacto ${e.contacto.nombre} <${e.contacto.email}>`);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.close();
  }
}

main();
