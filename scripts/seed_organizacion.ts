import Database from 'better-sqlite3';

const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

// owner_canonico = valor EXACTO de empresa.owner en isps.db, confirmado por consulta
// directa el 2026-07-06 (ver planning/spec-registro-organizacion.md). Camilo va con
// f minuscula a proposito: asi esta guardado en empresa.owner.
const MIEMBROS = [
  { ownerCanonico: 'Sebastian Acosta Molina', nombreDisplay: 'Sebastián Acosta', emailYaExistente: 'sacostamolin@gmail.com' },
  { ownerCanonico: 'Thomas Schumacher', nombreDisplay: 'Thomas Schumacher', emailYaExistente: null },
  { ownerCanonico: 'Felipe Castro', nombreDisplay: 'Felipe Castro', emailYaExistente: null },
  { ownerCanonico: 'Camilo fonseca', nombreDisplay: 'Camilo Fonseca', emailYaExistente: null },
];

function main() {
  const db = new Database(DB_PATH);
  try {
    db.exec('BEGIN');

    let org = db.prepare(`SELECT id_organizacion FROM organizacion WHERE nombre = ?`).get('Onepay') as
      | { id_organizacion: number }
      | undefined;
    if (!org) {
      const r = db.prepare(`INSERT INTO organizacion (nombre, created_at) VALUES (?, ?)`).run('Onepay', new Date().toISOString());
      org = { id_organizacion: Number(r.lastInsertRowid) };
      console.log('Organizacion Onepay creada, id', org.id_organizacion);
    } else {
      console.log('Organizacion Onepay ya existia, id', org.id_organizacion);
    }

    for (const m of MIEMBROS) {
      const existe = db
        .prepare(`SELECT id_miembro FROM organizacion_miembro WHERE id_organizacion = ? AND owner_canonico = ?`)
        .get(org.id_organizacion, m.ownerCanonico);
      if (existe) {
        console.log(`Miembro ${m.nombreDisplay} ya existia, se deja igual`);
        continue;
      }

      let idUser: string | null = null;
      if (m.emailYaExistente) {
        const u = db.prepare(`SELECT id FROM user WHERE email = ?`).get(m.emailYaExistente) as { id: string } | undefined;
        if (u) idUser = u.id;
      }

      db.prepare(
        `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(org.id_organizacion, m.ownerCanonico, m.nombreDisplay, idUser, new Date().toISOString());
      console.log(`Miembro ${m.nombreDisplay} creado${idUser ? ' (ya reclamado por cuenta existente)' : ' (libre)'}`);
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.close();
  }
}

main();
