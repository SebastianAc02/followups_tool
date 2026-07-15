// Tarea C2 (plan-prueba-real-multicanal.md): arma y lanza las 2 campanas reales de la
// prueba multicanal contra las empresas de scripts/seed_prueba_multicanal.ts (correrlo
// primero). Replica exactamente el bloque real de lanzarCampanaAction
// (app/campanas/[id]/lanzar/actions.ts): crearCampanaExterna -> guardarProveedorCampanaId
// -> pasosParaSincronizarCopy -> sincronizarCopy -> guardarSincronizacionCopy ->
// aprobarSecuencia (tarea A3 -- este ultimo paso es el que dispara el correo real).
//
// Guard duro: ISPS_DB_PATH obligatorio, sin default. Requiere ademas la credencial de
// Apollo (APOLLO_MAILBOX_ID en .env.local) ya confirmada por el probe (tarea A3 step 1)
// -- este script NO adivina esa parte, si falta truena con el mismo mensaje que la app.
//
// Correr: ISPS_DB_PATH=/ruta/a/isps.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/lanzar_prueba_multicanal.ts

import {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  guardarProveedorCampanaId,
  pasosParaSincronizarCopy,
  guardarSincronizacionCopy,
  campanaParaLanzar,
} from '../app/db/repository.ts';
import { crearRegistroEnvio } from '../app/adapters/registro-envio.ts';
import type { Canal } from '../app/db/validation.ts';

import { marcarModoPrueba } from '../app/lib/modo-prueba.ts';

// Los scripts no pasan por requireSession(), asi que declaran su modo a mano: sin esto
// el primer acceso a la DB lanza (modo-prueba.ts no tiene default a proposito).
marcarModoPrueba(false);

const dbPath = process.env.ISPS_DB_PATH;
if (!dbPath) {
  throw new Error('ISPS_DB_PATH es obligatorio (para la prueba real, apunta a ../isps.db).');
}

const ID_ORGANIZACION = 1; // Onepay, mismo criterio que seed_prueba_multicanal.ts

// Copy con [nombre]/[empresa]/[cargo] -- unicas variables soportadas hoy (Apollo no
// tiene merge-tag nativo para ciudad/usuarios, ver nota A2 del plan).
const ASUNTO = 'Una pregunta rapida para [empresa]';
const CUERPO =
  'Hola [nombre], te escribo porque vi que en [empresa] estan creciendo bastante. ' +
  'Como [cargo], seguro te interesa saber como estamos ayudando a otras agencias de viajes ' +
  'a simplificar cobros. Tienes 15 minutos esta semana?';

type CampanaPrueba = {
  nombre: string;
  idEmpresa: string;
  ciudad: string;
  canales: Canal[]; // orden = dia 0, 1, 2
};

const CAMPANAS: CampanaPrueba[] = [
  { nombre: 'Prueba multicanal A (Viajes Andinos)', idEmpresa: 'prueba-viajes-andinos', ciudad: 'Bogota', canales: ['correo', 'whatsapp', 'llamada'] },
  { nombre: 'Prueba multicanal B (Tour Caribe)', idEmpresa: 'prueba-tour-caribe', ciudad: 'Medellin', canales: ['whatsapp', 'correo', 'llamada'] },
];

async function lanzar(c: CampanaPrueba) {
  console.log(`\n== ${c.nombre} ==`);

  const idCadencia = crearCadencia({
    nombre: c.nombre,
    pasos: c.canales.map((canal, i) => ({
      orden: i + 1,
      diaOffset: i,
      canal,
      // llamada es Tier 1 (esManual): espera revision humana en /cola, nunca sale sola.
      esManual: canal === 'llamada',
      asunto: canal === 'correo' ? ASUNTO : undefined,
      cuerpo: CUERPO,
    })),
  });
  console.log('cadencia creada, id', idCadencia);

  // categoria='agencia_viajes' ya aisla de cualquier ISP/utility real; ciudad distingue
  // entre las 2 empresas de prueba (misma categoria en ambas).
  const idSegmento = guardarSegmento(
    {
      nombre: `seg-${c.idEmpresa}`,
      definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['agencia_viajes'] }, { campo: 'ciudad', op: 'en', valores: [c.ciudad] }] },
    },
    ID_ORGANIZACION,
  );
  console.log('segmento creado, id', idSegmento);

  const idCampana = crearCampana({ nombre: c.nombre, idCadencia, idSegmento }, ID_ORGANIZACION);
  console.log('campana creada, id', idCampana);

  const resultado = inscribirCampana(idCampana, ID_ORGANIZACION);
  console.log('inscripcion:', resultado);

  // Replica el bloque real de lanzarCampanaAction.
  const camp = campanaParaLanzar(idCampana, ID_ORGANIZACION);
  const adapter = crearRegistroEnvio().correo;
  if (!camp || !adapter) throw new Error('no se pudo resolver la campana o el adaptador de correo');

  const proveedorCampanaId = await adapter.crearCampanaExterna(camp.nombre);
  guardarProveedorCampanaId(idCampana, proveedorCampanaId, ID_ORGANIZACION);
  console.log('secuencia Apollo creada:', proveedorCampanaId);

  const pasos = pasosParaSincronizarCopy(camp.idCadencia);
  if (pasos.length > 0) {
    const sincronizados = await adapter.sincronizarCopy(proveedorCampanaId, pasos);
    guardarSincronizacionCopy(sincronizados);
    console.log('copy sincronizado:', sincronizados.length, 'paso(s)');
  }

  await adapter.aprobarSecuencia(proveedorCampanaId);
  console.log('secuencia APROBADA (Apollo mandara el correo real en su ronda de envio)');
}

async function main() {
  for (const c of CAMPANAS) {
    await lanzar(c);
  }
  console.log('\nListo. Verifica en Apollo que ambas secuencias existen, con copy y aprobadas.');
}

main();
