// Tarea C3 (plan-prueba-real-multicanal.md): salta dias sin esperar, para la prueba
// real. Retrocede inscripcion.fecha_inscripcion N dias -- el anchor que
// materializarPasosDebidos usa para calcular si el siguiente paso ya esta debido
// (date(fechaProgramada) <= date(hoy)). NO marca pasos como enviados: el paso d0 real
// ya quedo 'enviada' cuando el worker lo mando de verdad, asi que basta correr el
// worker de nuevo despues de este script para que materialice d1 (y, otro fast-forward
// + worker despues, d2).
//
// Uso: ISPS_DB_PATH=/ruta/a/isps.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/fast_forward_cadencia.ts \
//   --campana=<idCampana> --dias=<N>
// (o --inscripcion=<idInscripcion> en vez de --campana, para una sola)
//
// Despues de correrlo: npm run worker (materializa + push el paso que quedo debido).

import Database from 'better-sqlite3';

const dbPath = process.env.ISPS_DB_PATH;
if (!dbPath) {
  throw new Error('ISPS_DB_PATH es obligatorio (para la prueba real, apunta a ../isps.db).');
}

function leerArg(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const arg = process.argv.find((a) => a.startsWith(prefijo));
  return arg?.slice(prefijo.length);
}

const idCampanaArg = leerArg('campana');
const idInscripcionArg = leerArg('inscripcion');
const diasArg = leerArg('dias');

if (!diasArg || (!idCampanaArg && !idInscripcionArg)) {
  throw new Error('Uso: --campana=<id> --dias=<N> (o --inscripcion=<id> --dias=<N>)');
}
const dias = Number(diasArg);
if (!Number.isInteger(dias) || dias <= 0) {
  throw new Error('--dias debe ser un entero positivo');
}

function main() {
  const db = new Database(dbPath);
  try {
    const filas = idInscripcionArg
      ? db.prepare('SELECT id_inscripcion, fecha_inscripcion FROM inscripcion WHERE id_inscripcion = ?').all(Number(idInscripcionArg))
      : db.prepare(`SELECT id_inscripcion, fecha_inscripcion FROM inscripcion WHERE id_campana = ? AND estado = 'activa'`).all(Number(idCampanaArg));

    if (filas.length === 0) {
      console.log('Ninguna inscripcion activa encontrada con esos criterios.');
      return;
    }

    const stmt = db.prepare('UPDATE inscripcion SET fecha_inscripcion = ? WHERE id_inscripcion = ?');
    for (const f of filas as { id_inscripcion: number; fecha_inscripcion: string | null }[]) {
      const base = new Date(f.fecha_inscripcion ?? new Date().toISOString());
      base.setUTCDate(base.getUTCDate() - dias);
      const nuevaFecha = base.toISOString();
      stmt.run(nuevaFecha, f.id_inscripcion);
      console.log(`inscripcion ${f.id_inscripcion}: fecha_inscripcion ${f.fecha_inscripcion} -> ${nuevaFecha}`);
    }

    console.log(`\n${filas.length} inscripcion(es) adelantada(s) ${dias} dia(s). Corre el worker para materializar el siguiente paso.`);
  } finally {
    db.close();
  }
}

main();
